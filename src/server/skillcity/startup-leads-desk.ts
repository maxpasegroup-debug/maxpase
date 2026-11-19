import { createHash, randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { AccessError } from "@/server/authorization/engine";
import { requirePortalAccess } from "@/server/portals/policy";
import { operationalEvent } from "@/server/domain/operational-events";

const sources = ["WEBSITE", "EVENT", "REFERRAL", "CENTRE_WALK_IN", "APPROVED_CAMPAIGN"] as const;
const methods = ["CALL", "WHATSAPP", "EMAIL", "IN_PERSON"] as const;
const outcomes = ["NO_ANSWER", "CONNECTED", "CALLBACK_REQUESTED", "INTERESTED", "NOT_INTERESTED", "WRONG_NUMBER", "APPLICATION_STARTED", "APPLICATION_SUBMITTED", "DO_NOT_CONTACT"] as const;
const object = (raw: string) => { try { const value: unknown = JSON.parse(raw); return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; } catch { return {}; } };
const leadInput = z.object({
  name: z.string().trim().min(2).max(140), phone: z.string().trim().min(7).max(24), email: z.string().trim().email().max(254).or(z.literal("")).optional().default(""),
  district: z.string().trim().min(2).max(100), state: z.string().trim().min(2).max(100), centre: z.string().trim().max(160).optional().default(""),
  source: z.enum(sources), campaign: z.string().trim().max(120).optional().default(""), programme: z.enum(["PBA_STARTER_30_DAYS", "PBA_PRO_180_DAYS", "UNDECIDED"]), contactPreference: z.enum(["CALL", "WHATSAPP", "EMAIL", "IN_PERSON"]), assignedCallerUserId: z.string().max(120).optional().default(""),
}).strict().superRefine((v, ctx) => {
  if (v.source === "APPROVED_CAMPAIGN" && !v.campaign) ctx.addIssue({ code: "custom", path: ["campaign"], message: "Enter the approved campaign name." });
  if (v.contactPreference === "EMAIL" && !v.email) ctx.addIssue({ code: "custom", path: ["email"], message: "Add an email address or choose a different contact preference." });
});
const activityInput = z.object({ leadId: z.string().min(10).max(100), method: z.enum(methods), outcome: z.enum(outcomes), notes: z.string().trim().min(4).max(1200), nextFollowUpAt: z.string().datetime().optional().or(z.literal("")) }).strict().superRefine((v, ctx) => { if (v.outcome === "CALLBACK_REQUESTED" && !v.nextFollowUpAt) ctx.addIssue({ code: "custom", path: ["nextFollowUpAt"], message: "Set the requested callback date and time." }); });

export function createStartupLeadsDesk(client: PrismaClient = prisma) {
  async function scope(userId: string) {
    const { ctx, companyId } = await requirePortalAccess(client, userId, "skillcity");
    const company = await client.organization.findUnique({ where: { id: companyId }, select: { slug: true, status: true, type: true } });
    const startup = await client.organization.findFirst({ where: { slug: "aira-startup-school", parentId: companyId, type: "DIVISION", status: "ACTIVE" }, select: { id: true } });
    if (!company || company.slug !== "aira-skill-city" || company.status !== "ACTIVE" || company.type !== "COMPANY" || !startup || !ctx.user?.personId) throw new AccessError("Startup Skool leads are unavailable");
    const [read, create, call, manage] = await Promise.all(["startup.lead.read", "startup.lead.create", "startup.lead.call", "startup.lead.manage"].map(key => ctx.decide(key, { organizationId: startup.id })));
    if (![read.allowed, create.allowed, call.allowed, manage.allowed].some(Boolean)) throw new AccessError("Startup Skool lead access is not authorized");
    return { userId, personId: ctx.user.personId, companyId, divisionId: startup.id, canRead: read.allowed || manage.allowed, canCreate: create.allowed || manage.allowed, canCall: call.allowed || manage.allowed, canManage: manage.allowed };
  }
  async function eligibleCallers(divisionId: string) {
    const memberships = await client.membership.findMany({ where: { organizationId: divisionId, projectId: null, status: "ACTIVE", roles: { some: { role: { organizationId: divisionId, key: { in: ["startup-admissions-caller", "startup-admissions-officer", "startup-division-director"] }, status: "ACTIVE" } } }, person: { status: "ACTIVE", users: { some: { status: "ACTIVE", emailVerifiedAt: { not: null } } } } }, select: { person: { select: { displayName: true, users: { where: { status: "ACTIVE", emailVerifiedAt: { not: null } }, select: { id: true, email: true }, take: 1 } } } }, orderBy: { person: { displayName: "asc" } }, take: 100 });
    return memberships.flatMap(m => m.person.users.map(u => ({ id: u.id, name: m.person.displayName, email: u.email })));
  }
  async function page(userId: string) {
    const s = await scope(userId);
    if (!s.canRead) throw new AccessError("You cannot view the Startup Skool lead pipeline");
    const rows = await client.executiveRecord.findMany({ where: { organizationId: s.divisionId, kind: "STARTUP_PROSPECT_LEAD" }, select: { id: true, title: true, status: true, payload: true, ownerPersonId: true, dueAt: true, version: true, createdAt: true, updatedAt: true, history: { select: { actorUserId: true, toStatus: true, reason: true, createdAt: true, actor: { select: { email: true } } }, orderBy: { createdAt: "desc" }, take: 20 } }, orderBy: [{ dueAt: "asc" }, { updatedAt: "desc" }], take: 1000 });
    const userIds = [...new Set(rows.map(row => String(object(row.payload).assignedCallerUserId ?? "")).filter(Boolean))];
    const users = userIds.length ? await client.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true, person: { select: { displayName: true } } } }) : [];
    const byUser = new Map(users.map(u => [u.id, { name: u.person?.displayName ?? u.email ?? "Staff", email: u.email ?? "" }]));
    const allLeads = rows.map(row => { const p = object(row.payload), assignee = byUser.get(String(p.assignedCallerUserId ?? "")); return { id: row.id, name: String(p.name ?? row.title), phone: String(p.phone ?? ""), email: String(p.email ?? ""), district: String(p.district ?? ""), state: String(p.state ?? ""), centre: String(p.centre ?? ""), source: String(p.source ?? "WEBSITE"), campaign: String(p.campaign ?? ""), programme: String(p.programme ?? "UNDECIDED"), contactPreference: String(p.contactPreference ?? "CALL"), status: row.status, assignedCallerUserId: String(p.assignedCallerUserId ?? ""), assignedCaller: assignee?.name ?? "Unassigned", assignedCallerEmail: assignee?.email ?? "", latestNotes: String(p.latestNotes ?? ""), dueAt: row.dueAt, createdAt: row.createdAt, version: row.version, createdBy: String(p.createdBy ?? ""), history: row.history } });
    const leads = s.canManage ? allLeads : allLeads.filter(row => row.assignedCallerUserId === userId);
    const ids = leads.map(lead => lead.id);
    const applicationLinks = s.canManage && ids.length ? await client.executiveRecord.findMany({ where: { organizationId: s.divisionId, kind: "STARTUP_LEAD_APPLICATION_LINK", status: "LINKED" }, select: { payload: true }, take: 2000 }) : [];
    const linkedApplicationByLead = new Map<string, { reference: string; source: string; applicationId: string }>();
    for (const link of applicationLinks) {
      const payload = object(link.payload), leadId = typeof payload.linkedLeadId === "string" ? payload.linkedLeadId : "";
      if (!ids.includes(leadId) || linkedApplicationByLead.has(leadId)) continue;
      linkedApplicationByLead.set(leadId, { reference: String(payload.applicationReference ?? "Application"), source: String(payload.applicationSource ?? ""), applicationId: String(payload.applicationId ?? "") });
    }
    const leadsWithApplications = leads.map(lead => ({ ...lead, linkedApplication: linkedApplicationByLead.get(lead.id) ?? null }));
    const activityRows = ids.length ? await client.executiveRecord.findMany({ where: { organizationId: s.divisionId, kind: "STARTUP_LEAD_ACTIVITY", payload: { contains: "\"leadId\"" } }, select: { id: true, title: true, status: true, payload: true, owner: { select: { displayName: true } }, dueAt: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 2000 }) : [];
    const activity = activityRows.flatMap(row => { const p = object(row.payload); if (typeof p.leadId !== "string" || !ids.includes(p.leadId)) return []; return [{ id: row.id, leadId: p.leadId, leadName: String(p.leadName ?? "Prospect"), caller: row.owner.displayName, callerUserId: String(p.callerUserId ?? ""), method: String(p.method ?? "CALL"), outcome: String(p.outcome ?? row.status), notes: String(p.notes ?? ""), centre: String(p.centre ?? ""), district: String(p.district ?? ""), source: String(p.source ?? ""), campaign: String(p.campaign ?? ""), createdAt: row.createdAt, nextFollowUpAt: row.dueAt }]; });
    return { ...s, leads: leadsWithApplications, activity, callers: s.canManage ? await eligibleCallers(s.divisionId) : [], counts: { all: leads.length, callbacksDue: leads.filter(l => l.dueAt && l.dueAt <= new Date() && !["DO_NOT_CONTACT", "NOT_INTERESTED", "WRONG_NUMBER", "APPLICATION_SUBMITTED"].includes(l.status)).length, upcomingCallbacks: leads.filter(l => l.dueAt && l.dueAt > new Date() && !["DO_NOT_CONTACT", "NOT_INTERESTED", "WRONG_NUMBER", "APPLICATION_SUBMITTED"].includes(l.status)).length, interested: leads.filter(l => l.status === "INTERESTED").length, linkedApplications: linkedApplicationByLead.size, applicationIntent: leads.filter(l => ["APPLICATION_STARTED", "APPLICATION_SUBMITTED"].includes(l.status)).length, doNotContact: leads.filter(l => l.status === "DO_NOT_CONTACT").length } };
  }
  async function createLead(userId: string, raw: unknown) {
    const s = await scope(userId); if (!s.canCreate) throw new AccessError("You cannot create Startup Skool leads");
    const input = leadInput.parse(raw), entered = input.phone.replace(/[\s()-]/g, "");
    const phone = entered.startsWith("+") ? entered : entered.length === 10 ? `+91${entered}` : entered.length === 12 && entered.startsWith("91") ? `+${entered}` : entered;
    if (!/^\+[1-9]\d{6,14}$/.test(phone)) throw new Error("Enter a valid number with country code, such as +91 98765 43210.");
    const callers = await eligibleCallers(s.divisionId);
    const assignee = s.canManage ? input.assignedCallerUserId || userId : userId;
    if (!callers.some(c => c.id === assignee)) throw new AccessError("Assign this lead only to an active, authorized Startup Skool caller");
    const existing = await client.executiveRecord.findFirst({ where: { organizationId: s.divisionId, kind: "STARTUP_PROSPECT_LEAD", payload: { contains: `"phone":"${phone}"` } }, select: { id: true } });
    if (existing) throw new Error("A lead with this number already exists. Find and update that lead instead.");
    try { return await client.$transaction(async db => {
      const phoneKey = createHash("sha256").update(`${s.divisionId}:${phone}`).digest("hex");
      const row = await db.executiveRecord.create({ data: { kind: "STARTUP_PROSPECT_LEAD", organizationId: s.divisionId, ownerPersonId: s.personId, title: input.name, status: "NEW", sourceKey: `startup:lead:${phoneKey}`, payload: JSON.stringify({ schemaVersion: 1, name: input.name, phone, email: input.email || null, district: input.district, state: input.state, centre: input.centre || null, source: input.source, campaign: input.campaign || null, programme: input.programme, contactPreference: input.contactPreference, assignedCallerUserId: assignee, createdBy: userId }), dueAt: null } });
      await db.executiveHistory.create({ data: { recordId: row.id, actorUserId: userId, toStatus: "NEW", reason: `Lead created from ${input.source}; assigned to ${callers.find(c => c.id === assignee)?.name ?? "caller"}` } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: s.personId, organizationId: s.divisionId, action: "startup.lead.created", entityType: "ExecutiveRecord", entityId: row.id, result: "SUCCESS", metadata: { source: input.source, assignedCallerUserId: assignee } });
      return row.id;
    }); } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") throw new Error("A lead with this number already exists. Find and update that lead instead.");
      throw error;
    }
  }
  async function assignLead(userId: string, raw: unknown) {
    const s = await scope(userId); if (!s.canManage) throw new AccessError("Only the AO or Startup Skool leadership can assign leads");
    const input = z.object({ id: z.string().min(10).max(100), version: z.coerce.number().int().nonnegative(), callerUserId: z.string().min(8).max(120), reason: z.string().trim().min(4).max(500) }).strict().parse(raw);
    const caller = (await eligibleCallers(s.divisionId)).find(c => c.id === input.callerUserId); if (!caller) throw new AccessError("Select an active authorized caller");
    return client.$transaction(async db => {
      const row = await db.executiveRecord.findFirst({ where: { id: input.id, organizationId: s.divisionId, kind: "STARTUP_PROSPECT_LEAD" }, select: { id: true, status: true, version: true, payload: true } });
      if (!row || row.version !== input.version) throw new AccessError("This lead changed; refresh before assigning");
      const p = object(row.payload), previous = String(p.assignedCallerUserId ?? ""); p.assignedCallerUserId = caller.id;
      if ((await db.executiveRecord.updateMany({ where: { id: row.id, version: row.version, status: row.status }, data: { payload: JSON.stringify(p), version: { increment: 1 } } })).count !== 1) throw new AccessError("This lead changed; refresh before assigning");
      await db.executiveHistory.create({ data: { recordId: row.id, actorUserId: userId, fromStatus: row.status, toStatus: row.status, reason: `Lead ${previous ? "reassigned" : "assigned"} to ${caller.name}: ${input.reason}` } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: s.personId, organizationId: s.divisionId, action: "startup.lead.assigned", entityType: "ExecutiveRecord", entityId: row.id, result: "SUCCESS", metadata: { previousCallerUserId: previous || null, assignedCallerUserId: caller.id } });
      return row.id;
    });
  }
  async function logActivity(userId: string, raw: unknown) {
    const s = await scope(userId); if (!s.canCall) throw new AccessError("You cannot log Startup Skool calling activity");
    const input = activityInput.parse(raw); const next = input.nextFollowUpAt ? new Date(input.nextFollowUpAt) : null;
    if (input.outcome === "DO_NOT_CONTACT" && next) throw new Error("Do not contact leads cannot be given a follow-up date.");
    return client.$transaction(async db => {
      const row = await db.executiveRecord.findFirst({ where: { id: input.leadId, organizationId: s.divisionId, kind: "STARTUP_PROSPECT_LEAD" }, select: { id: true, title: true, status: true, version: true, payload: true } });
      if (!row) throw new AccessError("Lead unavailable");
      const p = object(row.payload);
      if (!s.canManage && p.assignedCallerUserId !== userId) throw new AccessError("This lead is not assigned to you");
      if (row.status === "DO_NOT_CONTACT") throw new AccessError("This person asked not to be contacted. Only the AO may update the lead after review.");
      const updatedPayload = { ...p, latestNotes: input.notes, lastCallAt: new Date().toISOString() };
      if ((await db.executiveRecord.updateMany({ where: { id: row.id, version: row.version, status: row.status }, data: { status: input.outcome, payload: JSON.stringify(updatedPayload), dueAt: next, version: { increment: 1 } } })).count !== 1) throw new AccessError("This lead changed; refresh before logging the call");
      const activity = await db.executiveRecord.create({ data: { kind: "STARTUP_LEAD_ACTIVITY", organizationId: s.divisionId, ownerPersonId: s.personId, title: `Contact activity · ${row.title}`, status: input.outcome, sourceKey: `startup:lead-activity:${randomUUID()}`, dueAt: next, payload: JSON.stringify({ schemaVersion: 1, leadId: row.id, leadName: row.title, callerUserId: userId, method: input.method, outcome: input.outcome, notes: input.notes, centre: String(p.centre ?? ""), district: String(p.district ?? ""), source: String(p.source ?? ""), campaign: String(p.campaign ?? "") }) } });
      await db.executiveHistory.create({ data: { recordId: activity.id, actorUserId: userId, fromStatus: row.status, toStatus: input.outcome, reason: input.notes } });
      await db.executiveHistory.create({ data: { recordId: row.id, actorUserId: userId, fromStatus: row.status, toStatus: input.outcome, reason: `${input.method} · ${input.outcome}: ${input.notes}` } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: s.personId, organizationId: s.divisionId, action: "startup.lead.activity_logged", entityType: "ExecutiveRecord", entityId: row.id, result: "SUCCESS", metadata: { activityId: activity.id, method: input.method, outcome: input.outcome, followUpSet: !!next } });
      return activity.id;
    });
  }
  return { page, createLead, assignLead, logActivity };
}
export const startupLeadsDesk = createStartupLeadsDesk();
