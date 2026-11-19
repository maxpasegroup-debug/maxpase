import { createHash, randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { AccessError } from "@/server/authorization/engine";
import { requirePortalAccess } from "@/server/portals/policy";
import { operationalEvent } from "@/server/domain/operational-events";
import { privateContentStorage } from "@/server/nicejobs/content-storage";
import { validateContentFile } from "@/server/nicejobs/content-validation";

const documentKinds = ["CENTRE", "PROGRAMME", "EMPLOYEE", "VENDOR", "ADMISSIONS"] as const;
const grievanceCategories = ["ADMISSIONS", "CENTRE_FACILITY", "STAFF_CONDUCT", "SAFETY", "FINANCE", "VENDOR", "OTHER"] as const;
const severities = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
const statuses = ["OPEN", "IN_REVIEW", "ACTION_REQUIRED", "ESCALATED", "RESOLVED", "CLOSED"] as const;
const obj = (raw: string) => { try { const value: unknown = JSON.parse(raw); return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; } catch { return {}; } };
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const sensitiveDocKind = (kind: string) => kind === "EMPLOYEE" || kind === "ADMISSIONS";

export function createStartupRecordsGrievancesDesk(client: PrismaClient = prisma) {
  const storage = privateContentStorage();
  async function scope(userId: string) {
    const { ctx, companyId } = await requirePortalAccess(client, userId, "skillcity");
    const [company, division] = await Promise.all([
      client.organization.findUnique({ where: { id: companyId }, select: { slug: true, type: true, status: true } }),
      client.organization.findFirst({ where: { slug: "aira-startup-school", parentId: companyId, type: "DIVISION", status: "ACTIVE" }, select: { id: true } }),
    ]);
    if (!company || company.slug !== "aira-skill-city" || company.type !== "COMPANY" || company.status !== "ACTIVE" || !division || !ctx.user?.personId) throw new AccessError("Startup Skool records are unavailable");
    const keys = ["startup.records.read", "startup.records.manage", "startup.records.sensitive.read", "startup.records.sensitive.manage", "startup.grievance.submit", "startup.grievance.read", "startup.grievance.manage", "startup.grievance.sensitive.read"];
    const decisions = await Promise.all(keys.map(key => ctx.decide(key, { organizationId: division.id })));
    const grant = (key: string) => decisions[keys.indexOf(key)]?.allowed ?? false;
    return { userId, personId: ctx.user.personId, companyId, divisionId: division.id, canReadRecords: grant("startup.records.read") || grant("startup.records.manage"), canManageRecords: grant("startup.records.manage"), canReadSensitiveRecords: grant("startup.records.sensitive.read"), canManageSensitiveRecords: grant("startup.records.sensitive.manage"), canSubmitGrievance: grant("startup.grievance.submit"), canReadGrievances: grant("startup.grievance.read") || grant("startup.grievance.manage"), canManageGrievances: grant("startup.grievance.manage"), canReadSensitiveGrievances: grant("startup.grievance.sensitive.read") };
  }

  async function workspace(userId: string, filter: { search?: string; documentType?: string } = {}) {
    const s = await scope(userId), search = (filter.search ?? "").trim().slice(0, 100), documentType = documentKinds.includes(filter.documentType as typeof documentKinds[number]) ? filter.documentType : "";
    const [documentRows, grievanceRows, centreRows] = await Promise.all([
      s.canReadRecords ? client.executiveRecord.findMany({ where: { organizationId: s.divisionId, kind: "STARTUP_RECORD_DOCUMENT", ...(s.canManageRecords ? {} : { ownerPersonId: s.personId }) }, select: { id: true, ownerPersonId: true, title: true, status: true, payload: true, createdAt: true, history: { select: { toStatus: true, reason: true, createdAt: true, actor: { select: { email: true } } }, orderBy: { createdAt: "desc" }, take: 15 } }, orderBy: { createdAt: "desc" }, take: 400 }) : [],
      s.canReadGrievances ? client.executiveRecord.findMany({ where: { organizationId: s.divisionId, kind: "STARTUP_GRIEVANCE", ...(s.canManageGrievances ? {} : { ownerPersonId: s.personId }) }, select: { id: true, ownerPersonId: true, title: true, status: true, payload: true, dueAt: true, version: true, createdAt: true, updatedAt: true, owner: { select: { displayName: true } }, history: { select: { toStatus: true, reason: true, createdAt: true, actor: { select: { email: true } } }, orderBy: { createdAt: "desc" }, take: 25 } }, orderBy: [{ dueAt: "asc" }, { updatedAt: "desc" }], take: 300 }) : [],
      s.canReadRecords ? client.executiveRecord.findMany({ where: { organizationId: s.divisionId, kind: "STARTUP_CENTRE", ...(s.canManageRecords ? {} : { payload: { contains: `"centreManagerPersonId":"${s.personId}"` } }) }, select: { id: true, title: true, payload: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 400 }) : [],
    ]);
    const fileIds = [...new Set([...documentRows.flatMap(row => { const files = obj(row.payload).files; return Array.isArray(files) ? files.filter((id): id is string => typeof id === "string") : []; }), ...centreRows.flatMap(row => { const files = obj(row.payload).attachments; return Array.isArray(files) ? files.filter((id): id is string => typeof id === "string") : []; })])];
    const files = fileIds.length ? await client.niceJobsContentFile.findMany({ where: { id: { in: fileIds }, companyId: s.companyId, organizationId: s.divisionId }, select: { id: true, filename: true, mime: true, bytes: true, createdAt: true } }) : [];
    const fileById = new Map(files.map(file => [file.id, file]));
    const registeredDocuments = documentRows.map(row => {
      const p = obj(row.payload), sensitive = !!p.sensitive || sensitiveDocKind(String(p.documentType ?? "")), canView = !sensitive || s.canReadSensitiveRecords;
      const fileIds = Array.isArray(p.files) ? p.files.filter((id): id is string => typeof id === "string") : [];
      return { id: row.id, title: canView ? row.title : "Restricted document", documentType: canView ? String(p.documentType ?? "OTHER") : "RESTRICTED", category: canView ? String(p.category ?? "") : "Sensitive record", entityLabel: canView ? String(p.entityLabel ?? "") : "Restricted", entityReference: canView ? String(p.entityReference ?? "") : "", tags: canView ? String(p.tags ?? "") : "", sensitive, createdAt: row.createdAt, files: canView ? fileIds.flatMap(id => { const file = fileById.get(id); return file ? [{ id, filename: file.filename, mime: file.mime, bytes: file.bytes }] : []; }) : [], history: canView ? row.history : [] };
    });
    const centreDocuments = centreRows.flatMap(row => {
      const p = obj(row.payload), attached = Array.isArray(p.attachments) ? p.attachments.filter((id): id is string => typeof id === "string") : [];
      const attachedFiles = attached.flatMap(id => { const file = fileById.get(id); return file ? [{ id, filename: file.filename, mime: file.mime, bytes: file.bytes }] : []; });
      return attachedFiles.length ? [{ id: `centre:${row.id}`, sourceKind: "CENTRE" as const, sourceRecordId: row.id, title: row.title, documentType: "CENTRE", category: "Centre supporting documents", entityLabel: row.title, entityReference: row.id, tags: "", sensitive: false, createdAt: row.createdAt, files: attachedFiles, history: [] as typeof registeredDocuments[number]["history"] }] : [];
    });
    const documents = [...registeredDocuments.map(document => ({ ...document, sourceKind: "REGISTER" as const, sourceRecordId: document.id })), ...centreDocuments].filter(document => (!documentType || document.documentType === documentType || document.documentType === "RESTRICTED" && (documentType === "EMPLOYEE" || documentType === "ADMISSIONS")) && (!search || [document.title, document.documentType, document.category, document.entityLabel, document.entityReference, document.tags].some(value => value.toLowerCase().includes(search.toLowerCase()))));
    const now = new Date();
    const grievances = grievanceRows.map(row => {
      const p = obj(row.payload), restricted = !!p.sensitive, canView = !restricted || s.canReadSensitiveGrievances || row.ownerPersonId === s.personId;
      const dueAt = row.dueAt;
      const actions = Array.isArray(p.actions) ? p.actions as Record<string, unknown>[] : [];
      return { id: row.id, reference: String(p.reference ?? row.id.slice(-8).toUpperCase()), title: canView ? row.title : "Restricted grievance", category: canView ? String(p.category ?? "OTHER") : "SENSITIVE", severity: String(p.severity ?? "NORMAL"), sensitive: restricted, status: row.status, assignedUserId: String(p.assignedUserId ?? ""), assignedPersonId: String(p.assignedPersonId ?? ""), assignedName: String(p.assignedName ?? "Unassigned"), dueAt, createdAt: row.createdAt, version: row.version, overdue: !!dueAt && dueAt < now && !["RESOLVED", "CLOSED"].includes(row.status), escalationRequired: ["HIGH", "URGENT"].includes(String(p.severity)) || (!!dueAt && dueAt < now && !["RESOLVED", "CLOSED", "ESCALATED"].includes(row.status)), details: canView ? String(p.details ?? "") : "", resolution: canView ? String(p.resolution ?? "") : "", actions: canView ? actions.map(action => ({ type: String(action.type ?? "NOTE"), note: String(action.note ?? ""), actor: String(action.actorName ?? "Authorized staff"), createdAt: String(action.createdAt ?? "") })) : [], history: canView ? row.history : [] };
    }).filter(grievance => !search || [grievance.reference, grievance.title, grievance.category, grievance.details, grievance.status, grievance.assignedName].some(value => value.toLowerCase().includes(search.toLowerCase())));
    const assignees = s.canManageGrievances ? await client.membership.findMany({ where: { organizationId: s.divisionId, projectId: null, status: "ACTIVE", roles: { some: { role: { organizationId: s.divisionId, key: { in: ["startup-admissions-officer", "startup-division-director", "startup-centre-manager"] }, status: "ACTIVE" } } }, person: { status: "ACTIVE", users: { some: { status: "ACTIVE" } } } }, select: { person: { select: { id: true, displayName: true, users: { where: { status: "ACTIVE" }, select: { id: true, email: true }, take: 1 } } } }, orderBy: { person: { displayName: "asc" } }, take: 150 }) : [];
    const owners = assignees.flatMap(row => row.person.users.map(user => ({ userId: user.id, personId: row.person.id, name: row.person.displayName, email: user.email ?? "" })));
    const [centres, programmes, employees, admissions] = await Promise.all([
      s.canReadRecords ? client.executiveRecord.findMany({ where: { organizationId: s.divisionId, kind: "STARTUP_CENTRE", ...(s.canManageRecords ? {} : { payload: { contains: `"centreManagerPersonId":"${s.personId}"` } }) }, select: { id: true, title: true }, orderBy: { title: "asc" }, take: 300 }) : [],
      s.canManageRecords ? client.program.findMany({ where: { companyOrganizationId: s.companyId, organizationId: s.divisionId, status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 200 }) : [],
      s.canManageSensitiveRecords ? client.employment.findMany({ where: { companyId: s.companyId, status: "ACTIVE" }, select: { id: true, person: { select: { displayName: true } } }, orderBy: { person: { displayName: "asc" } }, take: 500 }) : [],
      s.canManageSensitiveRecords ? client.startupPublicApplicant.findMany({ where: { organizationId: s.companyId, submittedAt: { not: null } }, select: { id: true, reference: true, fullName: true }, orderBy: { submittedAt: "desc" }, take: 500 }) : [],
    ]);
    return { ...s, documents, grievances, owners, documentTargets: { centres: centres.map(row => ({ id: row.id, name: row.title })), programmes, employees: employees.map(row => ({ id: row.id, name: row.person.displayName })), admissions: admissions.map(row => ({ id: row.id, name: `${row.reference} · ${row.fullName ?? "Applicant"}` })) }, counts: { documentCount: documents.length, grievanceCount: grievances.length, openGrievances: grievances.filter(g => !["RESOLVED", "CLOSED"].includes(g.status)).length, overdueGrievances: grievances.filter(g => g.overdue).length, escalationRequired: grievances.filter(g => g.escalationRequired && g.status !== "ESCALATED" && !["RESOLVED", "CLOSED"].includes(g.status)).length } };
  }

  async function validateDocumentTarget(s: Awaited<ReturnType<typeof scope>>, kind: typeof documentKinds[number], sourceId: string) {
    if (kind === "CENTRE") {
      const row = await client.executiveRecord.findFirst({ where: { id: sourceId, organizationId: s.divisionId, kind: "STARTUP_CENTRE" }, select: { id: true } }); if (!row) throw new AccessError("Select a Startup Skool centre record"); return;
    }
    if (kind === "PROGRAMME") {
      const row = await client.program.findFirst({ where: { id: sourceId, companyOrganizationId: s.companyId, organizationId: s.divisionId }, select: { id: true } }); if (!row) throw new AccessError("Select a Startup Skool programme"); return;
    }
    if (kind === "EMPLOYEE") {
      const row = await client.employment.findFirst({ where: { id: sourceId, companyId: s.companyId }, select: { id: true } }); if (!row) throw new AccessError("Select an AIRA Skill City employee record"); return;
    }
    if (kind === "ADMISSIONS") {
      const publicRecord = await client.startupPublicApplicant.findFirst({ where: { organizationId: s.companyId, OR: [{ id: sourceId }, { reference: sourceId }], submittedAt: { not: null } }, select: { id: true } });
      const legacy = publicRecord ? null : await client.executiveRecord.findFirst({ where: { id: sourceId, organizationId: s.divisionId, kind: "STARTUP_APPLICATION" }, select: { id: true } });
      if (!publicRecord && !legacy) throw new AccessError("Select an existing submitted Startup Skool application"); return;
    }
    if (kind === "VENDOR" && sourceId.trim().length < 2) throw new AccessError("Enter the vendor name or vendor reference");
  }

  async function uploadDocument(userId: string, raw: unknown, file: { name: string; type: string; bytes: Uint8Array }) {
    const s = await scope(userId); if (!s.canManageRecords) throw new AccessError("You cannot add records to the Startup Skool register");
    const input = z.object({ documentType: z.enum(documentKinds), category: z.string().trim().min(2).max(80), title: z.string().trim().min(2).max(160), entityLabel: z.string().trim().min(2).max(160), entityReference: z.string().trim().min(1).max(160), tags: z.string().trim().max(400).optional().default(""), sensitive: z.coerce.boolean().optional().default(false) }).strict().parse(raw);
    if (sensitiveDocKind(input.documentType) && !input.sensitive) throw new AccessError("Employee and admissions documents must be marked restricted");
    if (input.sensitive && !s.canManageSensitiveRecords) throw new AccessError("You are not authorized to add restricted employee or admissions documents");
    await validateDocumentTarget(s, input.documentType, input.entityReference);
    const checked = await validateContentFile(file.name, file.type || "application/octet-stream", file.bytes);
    if (!(checked.mediaType === "PDF" || checked.mediaType === "IMAGE") || checked.bytes > 20 * 1024 * 1024) throw new Error("Attach a PDF or image up to 20 MB.");
    const id = randomUUID(), fileHash = digest(file.bytes); await storage.write(id, file.bytes);
    try {
      return await client.$transaction(async db => {
        const actor = await db.user.findUnique({ where: { id: userId }, select: { personId: true, status: true } });
        if (!actor?.personId || actor.status !== "ACTIVE" || actor.personId !== s.personId) throw new AccessError("Employee identity changed; sign in again");
        await db.niceJobsContentFile.create({ data: { id, companyId: s.companyId, organizationId: s.divisionId, uploaderUserId: userId, idempotencyKey: randomUUID(), fingerprint: digest(new TextEncoder().encode(`${checked.filename}:${s.divisionId}:${fileHash}`)), digest: fileHash, ...checked } });
        const record = await db.executiveRecord.create({ data: { kind: "STARTUP_RECORD_DOCUMENT", organizationId: s.divisionId, ownerPersonId: s.personId, title: input.title, status: "ACTIVE", sourceKey: `startup:document:${randomUUID()}`, payload: JSON.stringify({ schemaVersion: 1, documentType: input.documentType, category: input.category, entityLabel: input.entityLabel, entityReference: input.entityReference, tags: input.tags, sensitive: input.sensitive, files: [id] }) } });
        await db.executiveHistory.create({ data: { recordId: record.id, actorUserId: userId, toStatus: "ACTIVE", reason: `Record added to ${input.documentType.toLowerCase()} register: ${input.title}` } });
        await operationalEvent(db, { actorUserId: userId, actorPersonId: s.personId, organizationId: s.divisionId, action: "startup.records.document_added", entityType: "ExecutiveRecord", entityId: record.id, result: "SUCCESS", metadata: { documentType: input.documentType, sensitive: input.sensitive } });
        return record.id;
      }, { timeout: 20000 });
    } catch (error) { await client.niceJobsContentFile.findUnique({ where: { id }, select: { id: true } }).then(row => row ? undefined : storage.rollback(id)).catch(() => undefined); throw error; }
  }

  async function downloadDocument(userId: string, recordId: string, fileId: string) {
    const s = await scope(userId), row = await client.executiveRecord.findFirst({ where: { id: recordId, organizationId: s.divisionId, kind: "STARTUP_RECORD_DOCUMENT", status: "ACTIVE", ...(s.canManageRecords ? {} : { ownerPersonId: s.personId }) }, select: { payload: true, ownerPersonId: true } });
    const p = row ? obj(row.payload) : {}, restricted = !!p.sensitive || sensitiveDocKind(String(p.documentType ?? ""));
    if (!row || !s.canReadRecords || restricted && !s.canReadSensitiveRecords || !Array.isArray(p.files) || !p.files.includes(fileId)) throw new AccessError("Document unavailable");
    const file = await client.niceJobsContentFile.findFirst({ where: { id: fileId, companyId: s.companyId, organizationId: s.divisionId } }); if (!file) throw new AccessError("Document unavailable");
    const bytes = await storage.read(file.id); if (bytes.length !== file.bytes || digest(bytes) !== file.digest) throw new Error("Document integrity check failed");
    await operationalEvent(client, { actorUserId: userId, actorPersonId: s.personId, organizationId: s.divisionId, action: "startup.records.document_accessed", entityType: "ExecutiveRecord", entityId: recordId, result: "SUCCESS", metadata: { fileId } });
    return { file, bytes };
  }

  async function submitGrievance(userId: string, raw: unknown) {
    const s = await scope(userId); if (!s.canSubmitGrievance) throw new AccessError("You cannot submit a Startup Skool grievance");
    const input = z.object({ title: z.string().trim().min(4).max(160), category: z.enum(grievanceCategories), severity: z.enum(severities), sensitive: z.coerce.boolean().optional().default(false), details: z.string().trim().min(12).max(5000), state: z.string().trim().max(100).optional().default(""), district: z.string().trim().max(100).optional().default(""), centre: z.string().trim().max(160).optional().default("") }).strict().parse(raw);
    const id = `startup:grievance:${randomUUID()}`, reference = `SSG-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
    return client.$transaction(async db => {
      const actor = await db.user.findUnique({ where: { id: userId }, select: { personId: true, status: true } }); if (!actor?.personId || actor.status !== "ACTIVE" || actor.personId !== s.personId) throw new AccessError("Employee identity changed; sign in again");
      const record = await db.executiveRecord.create({ data: { kind: "STARTUP_GRIEVANCE", organizationId: s.divisionId, ownerPersonId: s.personId, title: input.sensitive ? `Restricted grievance ${reference}` : input.title, status: "OPEN", sourceKey: id, payload: JSON.stringify({ schemaVersion: 1, reference, title: input.title, category: input.category, severity: input.severity, sensitive: input.sensitive, details: input.details, state: input.state, district: input.district, centre: input.centre, assignedUserId: "", assignedPersonId: "", assignedName: "Unassigned", resolution: "", actions: [] }) } });
      await db.executiveHistory.create({ data: { recordId: record.id, actorUserId: userId, toStatus: "OPEN", reason: input.sensitive ? "Restricted grievance received" : `Grievance received: ${input.category}` } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: s.personId, organizationId: s.divisionId, action: "startup.grievance.received", entityType: "ExecutiveRecord", entityId: record.id, result: "SUCCESS", metadata: { reference, category: input.sensitive ? "RESTRICTED" : input.category, severity: input.severity, sensitive: input.sensitive } });
      return reference;
    });
  }

  async function updateGrievance(userId: string, raw: unknown) {
    const s = await scope(userId); if (!s.canManageGrievances) throw new AccessError("You cannot manage Startup Skool grievances");
    const input = z.object({ id: z.string().min(20).max(100), version: z.coerce.number().int().nonnegative(), action: z.enum(["ASSIGN", "UPDATE", "ADD_ACTION", "RESOLVE", "ESCALATE"]), assignedUserId: z.string().max(120).optional().default(""), dueAt: z.string().datetime().optional().or(z.literal("")), status: z.enum(statuses).optional(), note: z.string().trim().max(1200).optional().default(""), resolution: z.string().trim().max(2400).optional().default("") }).strict().parse(raw);
    const row = await client.executiveRecord.findFirst({ where: { id: input.id, organizationId: s.divisionId, kind: "STARTUP_GRIEVANCE" }, select: { id: true, ownerPersonId: true, title: true, status: true, payload: true, dueAt: true, version: true } });
    if (!row || row.version !== input.version) throw new AccessError("Grievance changed; refresh and try again");
    const payload = obj(row.payload), restricted = !!payload.sensitive;
    if (restricted && !s.canReadSensitiveGrievances && input.action !== "ASSIGN" && input.action !== "ESCALATE") throw new AccessError("Sensitive grievance details are restricted; only assignment or escalation coordination is available");
    if (["RESOLVED", "CLOSED"].includes(row.status)) throw new AccessError("This grievance is closed");
    let nextStatus = row.status, nextDue: Date | null | undefined = undefined;
    const oldAssignee = String(payload.assignedUserId ?? "");
    if (input.dueAt !== undefined && input.dueAt !== "") { nextDue = new Date(input.dueAt); if (Number.isNaN(nextDue.getTime())) throw new Error("Enter a valid due date"); }
    else if (input.action === "ASSIGN" && input.dueAt === "") nextDue = null;
    if (input.action === "ASSIGN") {
      if (!input.assignedUserId) throw new Error("Choose a case owner");
      const member = await client.membership.findFirst({ where: { organizationId: s.divisionId, projectId: null, status: "ACTIVE", person: { status: "ACTIVE", users: { some: { id: input.assignedUserId, status: "ACTIVE" } } }, roles: { some: { role: { organizationId: s.divisionId, key: { in: ["startup-admissions-officer", "startup-division-director", "startup-centre-manager"] }, status: "ACTIVE" } } } }, select: { personId: true, person: { select: { displayName: true } } } });
      if (!member) throw new AccessError("Choose an active Startup Skool officer, Director or centre manager");
      const assignee = await client.user.findUnique({ where: { id: input.assignedUserId }, select: { email: true } });
      payload.assignedUserId = input.assignedUserId; payload.assignedPersonId = member.personId; payload.assignedName = member.person.displayName; payload.assignedEmail = assignee?.email ?? "";
    } else if (input.action === "UPDATE") { if (!input.status || ["ESCALATED", "RESOLVED", "CLOSED"].includes(input.status)) throw new Error("Use the dedicated escalation or resolution action for that status"); nextStatus = input.status; }
    else if (input.action === "ADD_ACTION") { if (!s.canReadSensitiveGrievances && restricted) throw new AccessError("Sensitive action notes are restricted"); if (input.note.length < 8) throw new Error("Add a short action note"); }
    else if (input.action === "RESOLVE") { if (!s.canReadSensitiveGrievances && restricted) throw new AccessError("Only a sensitive-case reviewer can record a resolution"); if (input.resolution.length < 12) throw new Error("Record the resolution before closing the case"); nextStatus = "RESOLVED"; payload.resolution = input.resolution; }
    else if (input.action === "ESCALATE") {
      const overdue = !!row.dueAt && row.dueAt <= new Date();
      if (!overdue && !["HIGH", "URGENT"].includes(String(payload.severity))) throw new AccessError("Escalate a serious or overdue case; add the reason to its action history");
      nextStatus = "ESCALATED";
    }
    if (input.action === "UPDATE" && restricted && !s.canReadSensitiveGrievances) throw new AccessError("Sensitive case status changes are restricted to authorized reviewers");
    if (input.action === "UPDATE" && !input.note.trim()) throw new Error("Add a brief reason for the status update");
    const actions = Array.isArray(payload.actions) ? payload.actions as Record<string, unknown>[] : [];
    const actor = await client.user.findUnique({ where: { id: userId }, select: { person: { select: { displayName: true } } } });
    if (input.action === "ADD_ACTION" || input.action === "UPDATE" || input.action === "RESOLVE" || input.action === "ESCALATE") actions.push({ type: input.action, note: input.action === "ESCALATE" && restricted && !s.canReadSensitiveGrievances ? "Escalated to leadership for authorized review" : input.note || input.resolution, actorName: actor?.person?.displayName ?? "Authorized staff", createdAt: new Date().toISOString() });
    payload.actions = actions;
    return client.$transaction(async db => {
      const changed = await db.executiveRecord.updateMany({ where: { id: row.id, organizationId: s.divisionId, kind: "STARTUP_GRIEVANCE", version: row.version, status: row.status }, data: { status: nextStatus, payload: JSON.stringify(payload), dueAt: nextDue === undefined ? row.dueAt : nextDue, version: { increment: 1 } } });
      if (changed.count !== 1) throw new AccessError("Grievance changed; refresh before saving");
      const reason = restricted && !s.canReadSensitiveGrievances ? input.action === "ASSIGN" ? "Grievance assignment updated" : "Serious or overdue grievance escalated to leadership" : input.note || input.resolution || `Grievance ${input.action.toLowerCase()}d`;
      await db.executiveHistory.create({ data: { recordId: row.id, actorUserId: userId, fromStatus: row.status, toStatus: nextStatus, reason } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: s.personId, organizationId: s.divisionId, action: `startup.grievance.${input.action.toLowerCase()}`, entityType: "ExecutiveRecord", entityId: row.id, result: "SUCCESS", metadata: { status: nextStatus, restricted, reassigned: input.action === "ASSIGN" && oldAssignee !== input.assignedUserId } });
      return row.id;
    });
  }

  return { scope, workspace, uploadDocument, downloadDocument, submitGrievance, updateGrievance };
}

export const startupRecordsGrievancesDesk = createStartupRecordsGrievancesDesk();
