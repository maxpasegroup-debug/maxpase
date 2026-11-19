import { createHash, randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { AccessError } from "@/server/authorization/engine";
import { requirePortalAccess } from "@/server/portals/policy";
import { operationalEvent } from "@/server/domain/operational-events";
import { privateContentStorage } from "@/server/nicejobs/content-storage";
import { validateContentFile } from "@/server/nicejobs/content-validation";

const kinds = ["COMMUNITY_CENTRE", "TRAINING_CENTRE", "CAMPUS", "OTHER"] as const;
const tenures = ["RENT", "LEASE", "PURCHASE", "EXISTING", "PARTNER"] as const;
const money = z.string().trim().regex(/^$|^\d{1,11}(\.\d{1,2})?$/, "Enter an amount with up to two decimal places.");
const proposalSchema = z.object({
  name: z.string().trim().min(3).max(140), type: z.enum(kinds), state: z.string().trim().min(2).max(100), district: z.string().trim().min(2).max(100),
  proposedLocation: z.string().trim().min(6).max(500), tenure: z.enum(tenures), commitmentDetails: z.string().trim().max(2000).optional().default(""),
  expectedSetupCost: money.optional().default(""), expectedRecurringCost: money.optional().default(""), leaseTerm: z.string().trim().max(120).optional().default(""),
  expectedOpeningDate: z.string().optional().default(""), propertyEndDate: z.string().optional().default(""), centreManagerUserId: z.string().max(120).optional().default(""), notes: z.string().trim().min(10).max(4000),
}).strict().superRefine((value, ctx) => {
  if (value.tenure !== "EXISTING" && !value.commitmentDetails.trim()) ctx.addIssue({ code: "custom", path: ["commitmentDetails"], message: "Describe the proposed rent, lease, purchase or partner arrangement." });
  if (value.tenure === "LEASE" && !value.leaseTerm.trim()) ctx.addIssue({ code: "custom", path: ["leaseTerm"], message: "Add the proposed lease term." });
  for (const field of ["expectedOpeningDate", "propertyEndDate"] as const) {
    const date = value[field];
    if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T00:00:00.000Z`).getTime()) || new Date(`${date}T00:00:00.000Z`).toISOString().slice(0, 10) !== date)) ctx.addIssue({ code: "custom", path: [field], message: "Enter a valid date." });
  }
});
const json = (raw: string) => { try { const value: unknown = JSON.parse(raw); return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; } catch { return {}; } };
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const transitions: Record<string, string[]> = {
  PROPOSED: ["UNDER_REVIEW"], UNDER_REVIEW: ["APPROVED", "DECLINED"], APPROVED: ["SETUP"], SETUP: ["OPENING_REVIEW"],
  OPENING_REVIEW: ["ACTIVE"], ACTIVE: ["RENEWAL_REVIEW", "CLOSURE_REVIEW"], RENEWAL_REVIEW: ["ACTIVE", "CLOSURE_REVIEW"], CLOSURE_REVIEW: ["CLOSED"],
};

export function createStartupCentreDesk(client: PrismaClient = prisma) {
  const storage = privateContentStorage();
  async function scope(userId: string) {
    const { ctx, companyId } = await requirePortalAccess(client, userId, "skillcity");
    const [company, division] = await Promise.all([
      client.organization.findUnique({ where: { id: companyId }, select: { slug: true, type: true, status: true } }),
      client.organization.findFirst({ where: { slug: "aira-startup-school", parentId: companyId, type: "DIVISION", status: "ACTIVE" }, select: { id: true } }),
    ]);
    if (!company || company.slug !== "aira-skill-city" || company.type !== "COMPANY" || company.status !== "ACTIVE" || !division || !ctx.user?.personId) throw new AccessError("Startup Skool centre management is unavailable");
    const [read, manage, approve] = await Promise.all(["startup.centre.read", "startup.centre.manage", "startup.centre.approve"].map(key => ctx.decide(key, { organizationId: division.id })));
    if (![read.allowed, manage.allowed, approve.allowed].some(Boolean)) return { userId, personId: ctx.user.personId, companyId, divisionId: division.id, canRead: false, canManage: false, canApprove: false };
    return { userId, personId: ctx.user.personId, companyId, divisionId: division.id, canRead: read.allowed || manage.allowed || approve.allowed, canManage: manage.allowed, canApprove: approve.allowed };
  }

  async function workspace(userId: string) {
    const s = await scope(userId);
    if (!s.canRead) return { ...s, centres: [], managers: [] };
    const rows = await client.executiveRecord.findMany({
      where: { organizationId: s.divisionId, kind: "STARTUP_CENTRE", ...(s.canManage || s.canApprove ? {} : { payload: { contains: `"centreManagerPersonId":"${s.personId}"` } }) },
      select: { id: true, title: true, status: true, payload: true, dueAt: true, version: true, createdAt: true, updatedAt: true, owner: { select: { displayName: true } }, history: { select: { actorUserId: true, fromStatus: true, toStatus: true, reason: true, createdAt: true, actor: { select: { email: true } } }, orderBy: { createdAt: "desc" }, take: 30 } },
      orderBy: [{ updatedAt: "desc" }], take: 500,
    });
    const managers = s.canManage ? await client.membership.findMany({ where: { organizationId: s.divisionId, projectId: null, status: "ACTIVE", roles: { some: { role: { organizationId: s.divisionId, key: "startup-centre-manager", status: "ACTIVE" } } }, person: { status: "ACTIVE", users: { some: { status: "ACTIVE" } } } }, select: { person: { select: { id: true, displayName: true, users: { where: { status: "ACTIVE" }, select: { id: true, email: true }, take: 1 } } } }, orderBy: { person: { displayName: "asc" } }, take: 150 }) : [];
    const managerOptions = managers.flatMap(row => row.person.users.map(user => ({ userId: user.id, personId: row.person.id, name: row.person.displayName, email: user.email ?? "" })));
    const managerPersonIds = [...new Set(rows.map(row => String(json(row.payload).centreManagerPersonId ?? "")).filter(Boolean))];
    const assignedManagers = managerPersonIds.length ? await client.person.findMany({ where: { id: { in: managerPersonIds } }, select: { id: true, displayName: true, users: { where: { status: "ACTIVE" }, select: { email: true }, take: 1 } } }) : [];
    const assignedManagerByPerson = new Map(assignedManagers.map(person => [person.id, { name: person.displayName, email: person.users[0]?.email ?? "" }]));
    const centres = rows.map(row => {
      const p = json(row.payload), centreManagerPersonId = String(p.centreManagerPersonId ?? "");
      const manager = managerOptions.find(option => option.personId === centreManagerPersonId) ?? assignedManagerByPerson.get(centreManagerPersonId);
      const tasks = Array.isArray(p.setupTasks) ? p.setupTasks.filter((task): task is Record<string, unknown> => !!task && typeof task === "object") : [];
      return { id: row.id, name: row.title, status: row.status, type: String(p.type ?? "OTHER"), state: String(p.state ?? ""), district: String(p.district ?? ""), proposedLocation: String(p.proposedLocation ?? ""), tenure: String(p.tenure ?? "EXISTING"), commitmentDetails: String(p.commitmentDetails ?? ""), expectedSetupCost: String(p.expectedSetupCost ?? ""), expectedRecurringCost: String(p.expectedRecurringCost ?? ""), leaseTerm: String(p.leaseTerm ?? ""), expectedOpeningDate: String(p.expectedOpeningDate ?? ""), propertyEndDate: String(p.propertyEndDate ?? ""), notes: String(p.notes ?? ""), owner: row.owner.displayName, centreManagerPersonId, centreManagerName: manager?.name ?? "Unassigned", centreManagerEmail: manager?.email ?? "", readinessNote: String(p.readinessNote ?? ""), attachments: Array.isArray(p.attachments) ? p.attachments.filter((id): id is string => typeof id === "string") : [], setupTasks: tasks.map(task => ({ id: String(task.id ?? ""), title: String(task.title ?? ""), owner: String(task.owner ?? ""), dueAt: typeof task.dueAt === "string" ? task.dueAt : "", completedAt: typeof task.completedAt === "string" ? task.completedAt : "", completedBy: String(task.completedBy ?? "") })), dueAt: row.dueAt, version: row.version, createdAt: row.createdAt, updatedAt: row.updatedAt, history: row.history };
    });
    return { ...s, centres, managers: managerOptions };
  }

  async function propose(userId: string, raw: unknown, files: readonly { name: string; type: string; bytes: Uint8Array }[] = []) {
    const s = await scope(userId); if (!s.canManage) throw new AccessError("You cannot prepare Startup Skool centre proposals");
    if (files.length > 8) throw new Error("Attach up to eight supporting documents.");
    const input = proposalSchema.parse(raw);
    if (input.tenure !== "EXISTING" && files.length === 0) throw new Error("Attach at least one supporting document for the proposed property commitment.");
    if (input.centreManagerUserId) {
      const eligible = await client.membership.findFirst({ where: { organizationId: s.divisionId, projectId: null, status: "ACTIVE", person: { users: { some: { id: input.centreManagerUserId, status: "ACTIVE" } }, status: "ACTIVE" }, roles: { some: { role: { organizationId: s.divisionId, key: "startup-centre-manager", status: "ACTIVE" } } } }, select: { personId: true } });
      if (!eligible) throw new AccessError("Select an active Startup Skool centre manager");
    }
    const saved: { id: string; checked: Awaited<ReturnType<typeof validateContentFile>>; hash: string }[] = [], uploaded: string[] = [];
    try {
      for (const file of files) {
        const checked = await validateContentFile(file.name, file.type || "application/octet-stream", file.bytes);
        if (checked.mediaType !== "PDF" && checked.mediaType !== "IMAGE" || checked.bytes > 20 * 1024 * 1024) throw new Error("Use PDF or image documents up to 20 MB each.");
        const id = randomUUID(); await storage.write(id, file.bytes); uploaded.push(id); saved.push({ id, checked, hash: digest(file.bytes) });
      }
      return await client.$transaction(async db => {
        const actor = await db.user.findUnique({ where: { id: userId }, select: { personId: true } });
        if (!actor?.personId || actor.personId !== s.personId) throw new AccessError("Employee identity changed; sign in again.");
        const managerMembership = input.centreManagerUserId ? await db.membership.findFirst({ where: { organizationId: s.divisionId, projectId: null, status: "ACTIVE", person: { users: { some: { id: input.centreManagerUserId, status: "ACTIVE" } }, status: "ACTIVE" }, roles: { some: { role: { organizationId: s.divisionId, key: "startup-centre-manager", status: "ACTIVE" } } } }, select: { personId: true } }) : null;
        for (const file of saved) await db.niceJobsContentFile.create({ data: { id: file.id, companyId: s.companyId, organizationId: s.divisionId, uploaderUserId: userId, idempotencyKey: randomUUID(), fingerprint: digest(new TextEncoder().encode(`${file.checked.filename}:${s.divisionId}:${file.hash}`)), digest: file.hash, ...file.checked } });
        const record = await db.executiveRecord.create({ data: { kind: "STARTUP_CENTRE", organizationId: s.divisionId, ownerPersonId: s.personId, title: input.name, status: "PROPOSED", sourceKey: `startup:centre:${randomUUID()}`, dueAt: input.expectedOpeningDate ? new Date(`${input.expectedOpeningDate}T00:00:00.000Z`) : null, payload: JSON.stringify({ schemaVersion: 1, type: input.type, state: input.state, district: input.district, proposedLocation: input.proposedLocation, tenure: input.tenure, commitmentDetails: input.commitmentDetails, expectedSetupCost: input.expectedSetupCost, expectedRecurringCost: input.expectedRecurringCost, leaseTerm: input.leaseTerm, expectedOpeningDate: input.expectedOpeningDate, propertyEndDate: input.propertyEndDate, centreManagerPersonId: managerMembership?.personId ?? "", notes: input.notes, attachments: saved.map(file => file.id), setupTasks: [], readinessNote: "", approval: null }) } });
        await db.executiveHistory.create({ data: { recordId: record.id, actorUserId: userId, toStatus: "PROPOSED", reason: `Centre proposed: ${input.tenure} · ${input.state}, ${input.district}` } });
        await operationalEvent(db, { actorUserId: userId, actorPersonId: s.personId, organizationId: s.divisionId, action: "startup.centre.proposed", entityType: "ExecutiveRecord", entityId: record.id, result: "SUCCESS", metadata: { tenure: input.tenure, attachmentCount: saved.length } });
        return record.id;
      }, { timeout: 30000 });
    } catch (error) {
      for (const id of uploaded) { const exists = await client.niceJobsContentFile.findUnique({ where: { id }, select: { id: true } }).catch(() => null); if (!exists) await storage.rollback(id).catch(() => undefined); }
      throw error;
    }
  }

  async function transition(userId: string, raw: unknown) {
    const s = await scope(userId), input = z.object({ id: z.string().min(20).max(100), version: z.coerce.number().int().nonnegative(), status: z.enum(["UNDER_REVIEW", "APPROVED", "SETUP", "OPENING_REVIEW", "ACTIVE", "RENEWAL_REVIEW", "CLOSURE_REVIEW", "CLOSED", "DECLINED"]), reason: z.string().trim().min(8).max(1000), readinessNote: z.string().trim().max(1000).optional().default("") }).strict().parse(raw);
    const current = await client.executiveRecord.findFirst({ where: { id: input.id, organizationId: s.divisionId, kind: "STARTUP_CENTRE" }, select: { id: true, ownerPersonId: true, status: true, version: true, payload: true } });
    if (!current || current.version !== input.version) throw new AccessError("This centre record changed. Refresh before updating it.");
    if (!transitions[current.status]?.includes(input.status)) throw new AccessError("That centre lifecycle transition is not allowed");
    const approval = ["APPROVED", "ACTIVE", "CLOSED"].includes(input.status) || (input.status === "ACTIVE" && current.status === "RENEWAL_REVIEW");
    if (approval && !s.canApprove) throw new AccessError("This step requires an authorized Startup Skool approver");
    if (approval && current.ownerPersonId === s.personId) throw new AccessError("A different authorized person must approve a centre proposal they did not create");
    if (!approval && !s.canManage) throw new AccessError("Only the Startup Skool AO can update centre operations");
    const payload = json(current.payload);
    if (input.status === "APPROVED" && payload.tenure !== "EXISTING" && (!String(payload.commitmentDetails ?? "").trim() || !Array.isArray(payload.attachments) || payload.attachments.length === 0)) throw new AccessError("Property commitment details and supporting documents are required before approval");
    if (input.status === "OPENING_REVIEW") {
      const tasks = Array.isArray(payload.setupTasks) ? payload.setupTasks as Record<string, unknown>[] : [];
      if (!tasks.length || tasks.some(task => !task.completedAt)) throw new AccessError("Complete every setup task before requesting opening readiness approval");
      if (!input.readinessNote.trim()) throw new AccessError("Add a readiness summary before requesting opening approval");
      payload.readinessNote = input.readinessNote.trim();
    }
    if (input.status === "APPROVED" || input.status === "ACTIVE" || input.status === "CLOSED") payload.approval = { status: input.status, actorUserId: userId, approvedAt: new Date().toISOString(), reason: input.reason };
    return client.$transaction(async db => {
      const changed = await db.executiveRecord.updateMany({ where: { id: current.id, organizationId: s.divisionId, kind: "STARTUP_CENTRE", status: current.status, version: current.version }, data: { status: input.status, payload: JSON.stringify(payload), version: { increment: 1 } } });
      if (changed.count !== 1) throw new AccessError("This centre record changed. Refresh and try again.");
      await db.executiveHistory.create({ data: { recordId: current.id, actorUserId: userId, fromStatus: current.status, toStatus: input.status, reason: input.reason } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: s.personId, organizationId: s.divisionId, action: `startup.centre.${input.status.toLowerCase()}`, entityType: "ExecutiveRecord", entityId: current.id, result: "SUCCESS", metadata: { from: current.status, to: input.status, approvalRequired: approval } });
      return current.id;
    });
  }

  async function addSetupTask(userId: string, raw: unknown) {
    const s = await scope(userId); if (!s.canManage) throw new AccessError("Only the authorized Startup Skool AO can manage setup tasks");
    const input = z.object({ id: z.string().min(20).max(100), version: z.coerce.number().int().nonnegative(), title: z.string().trim().min(3).max(180), owner: z.string().trim().max(120).optional().default(""), dueAt: z.string().datetime().optional().or(z.literal("")) }).strict().parse(raw);
    const row = await client.executiveRecord.findFirst({ where: { id: input.id, organizationId: s.divisionId, kind: "STARTUP_CENTRE", status: "SETUP", version: input.version }, select: { id: true, payload: true, version: true } });
    if (!row) throw new AccessError("Setup tasks can only be changed for a centre in setup");
    const payload = json(row.payload), tasks = Array.isArray(payload.setupTasks) ? payload.setupTasks : [];
    if (tasks.length >= 50) throw new Error("A centre can have at most 50 setup tasks.");
    tasks.push({ id: randomUUID(), title: input.title, owner: input.owner, dueAt: input.dueAt || "", completedAt: "", completedBy: "" }); payload.setupTasks = tasks;
    return client.$transaction(async db => {
      const changed = await db.executiveRecord.updateMany({ where: { id: row.id, version: row.version, status: "SETUP" }, data: { payload: JSON.stringify(payload), version: { increment: 1 } } });
      if (changed.count !== 1) throw new AccessError("This centre changed. Refresh before adding a task.");
      await db.executiveHistory.create({ data: { recordId: row.id, actorUserId: userId, fromStatus: "SETUP", toStatus: "SETUP", reason: `Setup task added: ${input.title}` } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: s.personId, organizationId: s.divisionId, action: "startup.centre.setup_task_added", entityType: "ExecutiveRecord", entityId: row.id, result: "SUCCESS", metadata: { taskTitle: input.title } });
      return row.id;
    });
  }

  async function completeSetupTask(userId: string, raw: unknown) {
    const s = await scope(userId); if (!s.canManage) throw new AccessError("Only the authorized Startup Skool AO can complete setup tasks");
    const input = z.object({ id: z.string().min(20).max(100), version: z.coerce.number().int().nonnegative(), taskId: z.string().uuid() }).strict().parse(raw);
    const row = await client.executiveRecord.findFirst({ where: { id: input.id, organizationId: s.divisionId, kind: "STARTUP_CENTRE", status: "SETUP", version: input.version }, select: { id: true, payload: true, version: true } });
    if (!row) throw new AccessError("Setup tasks can only be changed for a centre in setup");
    const payload = json(row.payload), tasks = Array.isArray(payload.setupTasks) ? payload.setupTasks as Record<string, unknown>[] : [], task = tasks.find(item => item.id === input.taskId);
    if (!task) throw new AccessError("Setup task unavailable");
    if (task.completedAt) throw new AccessError("This setup task is already complete");
    task.completedAt = new Date().toISOString(); task.completedBy = userId; payload.setupTasks = tasks;
    return client.$transaction(async db => {
      const changed = await db.executiveRecord.updateMany({ where: { id: row.id, version: row.version, status: "SETUP" }, data: { payload: JSON.stringify(payload), version: { increment: 1 } } });
      if (changed.count !== 1) throw new AccessError("This centre changed. Refresh before completing the task.");
      await db.executiveHistory.create({ data: { recordId: row.id, actorUserId: userId, fromStatus: "SETUP", toStatus: "SETUP", reason: `Setup task completed: ${String(task.title ?? "Task")}` } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: s.personId, organizationId: s.divisionId, action: "startup.centre.setup_task_completed", entityType: "ExecutiveRecord", entityId: row.id, result: "SUCCESS", metadata: { taskId: input.taskId } });
      return row.id;
    });
  }

  async function attachment(userId: string, centreId: string, fileId: string) {
    const s = await scope(userId);
    const centre = await client.executiveRecord.findFirst({ where: { id: centreId, organizationId: s.divisionId, kind: "STARTUP_CENTRE", ...(s.canManage || s.canApprove ? {} : { payload: { contains: `"centreManagerPersonId":"${s.personId}"` } }) }, select: { payload: true } });
    if (!centre || !s.canRead || !((json(centre.payload).attachments as unknown[] | undefined) ?? []).includes(fileId)) throw new AccessError("Centre document unavailable");
    const file = await client.niceJobsContentFile.findFirst({ where: { id: fileId, companyId: s.companyId, organizationId: s.divisionId } });
    if (!file) throw new AccessError("Centre document unavailable");
    const bytes = await storage.read(file.id); if (bytes.length !== file.bytes || digest(bytes) !== file.digest) throw new Error("Centre document integrity check failed");
    await operationalEvent(client, { actorUserId: userId, actorPersonId: s.personId, organizationId: s.divisionId, action: "startup.centre.document_accessed", entityType: "ExecutiveRecord", entityId: centreId, result: "SUCCESS", metadata: { fileId } });
    return { file, bytes };
  }

  return { scope, workspace, propose, transition, addSetupTask, completeSetupTask, attachment };
}

export const startupCentreDesk = createStartupCentreDesk();
