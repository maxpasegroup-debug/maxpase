import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { AccessError } from "@/server/authorization/engine";
import { requirePortalAccess } from "@/server/portals/policy";
import { createBossService } from "@/server/group/boss-service";
import { operationalEvent } from "@/server/domain/operational-events";
import { parseStartupApplicationPayload } from "@/server/portals/startup-applications";

const statuses = ["SUBMITTED", "IN_REVIEW", "CLARIFICATION_REQUIRED", "RETURNED_TO_AO", "APPROVED", "REJECTED"] as const;
const assignmentInput = z.object({ caseId: z.string().min(8).max(180), assignedUserId: z.string().min(8).max(120).or(z.literal("")), reason: z.string().trim().min(8).max(500) }).strict();
const followupInput = z.object({ caseId: z.string().min(8).max(180), contactMethod: z.enum(["CALL", "WHATSAPP", "EMAIL", "OTHER"]), outcome: z.enum(["CONTACTED", "NO_ANSWER", "CALLBACK_REQUESTED", "CLARIFICATION_REQUIRED", "OTHER"]), note: z.string().trim().min(8).max(2000), nextFollowUpAt: z.string().datetime().optional() }).strict();
const forwardInput = z.object({ caseId: z.string().min(8).max(180), outcome: z.literal("READY_FOR_LEADERSHIP_REVIEW"), reviewNote: z.string().trim().min(20).max(2000), contactVerified: z.literal("yes"), programReviewed: z.literal("yes"), locationReviewed: z.literal("yes") }).strict();
const taskInput = z.object({ caseId: z.string().min(8).max(180), followUpId: z.string().min(8).max(120) }).strict();
const caseId = (source: string, id: string) => `${source}:${id}`;
const parseCaseId = (id: string) => { const split = id.indexOf(":"); if (split < 1 || !["public", "legacy"].includes(id.slice(0, split))) throw new AccessError("Application unavailable"); return { source: id.slice(0, split) as "public" | "legacy", id: id.slice(split + 1) }; };
const jsonObject = (raw: string | null) => { try { const value: unknown = JSON.parse(raw ?? "{}"); return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; } catch { return {}; } };
const validRangeDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional();

type Scope = { userId: string; companyId: string; divisionId: string; personId: string; canManage: boolean; canLinkLeads: boolean; mode: "PORTAL" | "BOSS" };
type Filters = { program?: string; from?: string; to?: string; status?: string; district?: string; referral?: string; search?: string; page?: number; sort?: "newest" | "oldest" };

export function createStartupAdmissionsDesk(client: PrismaClient = prisma) {
  async function portalScope(userId: string): Promise<Scope> {
    const { ctx, companyId } = await requirePortalAccess(client, userId, "skillcity");
    const company = await client.organization.findUnique({ where: { id: companyId }, select: { slug: true, type: true, status: true } });
    const startup = await client.organization.findFirst({ where: { slug: "aira-startup-school", parentId: companyId, type: "DIVISION", status: "ACTIVE" }, select: { id: true } });
    const personId = ctx.user?.personId;
    if (!company || company.slug !== "aira-skill-city" || company.type !== "COMPANY" || company.status !== "ACTIVE" || !startup || !personId) throw new AccessError("Startup admissions workspace unavailable");
    const canRead = await ctx.decide("startup.application.read", { organizationId: startup.id });
    const isOfficer = ctx.grants.some(g => g.organizationId === startup.id && g.roleName === "Startup Skool Administrative Officer");
    const managerRole = ctx.grants.some(g => [companyId, startup.id].includes(g.organizationId ?? "") && ["Director", "Division Director"].includes(g.roleName ?? ""));
    const canManage = managerRole && (await ctx.decide("program.manage", { organizationId: startup.id })).allowed;
    if (!canRead.allowed && !isOfficer && !canManage) throw new AccessError("Startup admissions access is not authorized");
    if (isOfficer) {
      await ctx.requireAccess("startup.application.read", { organizationId: startup.id });
      await ctx.requireAccess("startup.application.triage", { organizationId: startup.id });
    } else if (canManage) {
      await ctx.requireAccess("organization.read", { organizationId: startup.id });
      await ctx.requireAccess("program.manage", { organizationId: startup.id });
    } else await ctx.requireAccess("startup.application.read", { organizationId: startup.id });
    const canLinkLeads = (await ctx.decide("startup.lead.manage", { organizationId: startup.id })).allowed;
    return { userId, companyId, divisionId: startup.id, personId, canManage, canLinkLeads, mode: "PORTAL" };
  }

  async function bossScope(userId: string, brandId: string): Promise<Scope> {
    const { ctx, root } = await createBossService(client).authority(userId);
    const brand = await client.brand.findUnique({ where: { id: brandId }, select: { slug: true, status: true, organizationId: true, organization: { select: { slug: true, type: true, status: true, parentId: true } } } });
    if (!brand || brand.slug !== "startup-school" || brand.status !== "ACTIVE" || brand.organization.slug !== "aira-skill-city" || brand.organization.type !== "COMPANY" || brand.organization.status !== "ACTIVE" || brand.organization.parentId !== root.id) throw new AccessError("Startup Skool brand unavailable");
    const division = await client.organization.findFirst({ where: { slug: "aira-startup-school", parentId: brand.organizationId, type: "DIVISION", status: "ACTIVE" }, select: { id: true } });
    if (!division || !ctx.user?.personId) throw new AccessError("Startup Skool admissions scope unavailable");
    await ctx.requireAccess("program.manage", { organizationId: division.id });
    await ctx.requireAccess("startup.application.read", { organizationId: division.id });
    return { userId, companyId: brand.organizationId, divisionId: division.id, personId: ctx.user.personId, canManage: true, canLinkLeads: false, mode: "BOSS" };
  }

  async function activeAssignments(scope: Scope) {
    const publicAssignments = await client.startupAdmissionAssignment.findMany({ where: { applicant: { organizationId: scope.companyId, status: { in: [...statuses] } }, status: "ACTIVE" }, select: { applicantId: true, assignedUserId: true, assignedAt: true }, orderBy: { assignedAt: "desc" } });
    const legacyRows = await client.executiveRecord.findMany({ where: { organizationId: scope.divisionId, kind: "STARTUP_ADMISSION_ASSIGNMENT", status: "ACTIVE" }, select: { id: true, payload: true, createdAt: true }, orderBy: { createdAt: "desc" } });
    const map = new Map<string, { userId: string; assignedAt: Date }>();
    for (const row of publicAssignments) map.set(caseId("public", row.applicantId), { userId: row.assignedUserId, assignedAt: row.assignedAt });
    for (const row of legacyRows) { const data = jsonObject(row.payload); if (typeof data.applicationId === "string" && typeof data.assignedUserId === "string") map.set(caseId("legacy", data.applicationId), { userId: data.assignedUserId, assignedAt: row.createdAt }); }
    return map;
  }

  async function officerOptions(scope: Scope) {
    const memberships = await client.membership.findMany({ where: { organizationId: scope.divisionId, status: "ACTIVE", projectId: null, roles: { some: { role: { organizationId: scope.divisionId, key: "startup-admissions-officer", name: "Startup Skool Administrative Officer", status: "ACTIVE" } } }, person: { status: "ACTIVE", employments: { some: { companyId: scope.companyId, status: "ACTIVE" } }, users: { some: { status: "ACTIVE", emailVerifiedAt: { not: null } } } } }, select: { person: { select: { displayName: true, users: { where: { status: "ACTIVE", emailVerifiedAt: { not: null } }, select: { id: true }, take: 1 } } }, roles: { where: { role: { key: "startup-admissions-officer", status: "ACTIVE" } }, select: { roleId: true }, take: 1 } }, orderBy: { person: { displayName: "asc" } }, take: 100 });
    return memberships.flatMap(m => m.person.users.map(u => ({ id: u.id, name: m.person.displayName })));
  }

  async function allCases(scope: Scope, rawFilters: Filters = {}) {
    const filters = { ...rawFilters, from: validRangeDate.safeParse(rawFilters.from).data, to: validRangeDate.safeParse(rawFilters.to).data };
    const assignmentMap = await activeAssignments(scope);
    const assignedIds = scope.canManage ? null : [...assignmentMap].filter(([, assignment]) => assignment.userId === scope.userId).map(([id]) => id);
    if (assignedIds && assignedIds.length === 0) return { cases: [], assignmentMap };
    const publicIds = assignedIds?.filter(id => id.startsWith("public:")).map(id => id.slice(7));
    const legacyIds = assignedIds?.filter(id => id.startsWith("legacy:")).map(id => id.slice(7));
    const dateFilter = filters.from || filters.to ? { gte: filters.from ? new Date(`${filters.from}T00:00:00.000Z`) : undefined, lte: filters.to ? new Date(`${filters.to}T23:59:59.999Z`) : undefined } : undefined;
    const statusFilter = filters.status && statuses.includes(filters.status as typeof statuses[number]) ? filters.status : undefined;
    const search = filters.search?.trim().slice(0, 100);
    const district = filters.district?.trim().slice(0, 100);
    const referralFilter = ["verified", "provided", "none"].includes(filters.referral ?? "") ? filters.referral : undefined;
    const publicRows = await client.startupPublicApplicant.findMany({ where: { organizationId: scope.companyId, status: statusFilter ? statusFilter : { in: [...statuses] }, submittedAt: { not: null, ...(dateFilter ?? {}) }, ...(publicIds ? { id: { in: publicIds } } : {}), ...(filters.program ? { programPreference: filters.program } : {}), ...(search ? { OR: [{ fullName: { contains: search, mode: "insensitive" } }, { mobile: { contains: search } }, { email: { contains: search, mode: "insensitive" } }, { reference: { contains: search, mode: "insensitive" } }] } : {}) }, select: { id: true, reference: true, fullName: true, mobile: true, email: true, state: true, city: true, district: true, preferredCentre: true, programPreference: true, entrepreneurialStage: true, businessInterest: true, goals: true, referralSnapshot: true, phoneVerifiedAt: true, consentVersion: true, status: true, version: true, submittedAt: true, createdAt: true, events: { select: { action: true, reason: true }, orderBy: { createdAt: "desc" }, take: 20 } }, orderBy: { submittedAt: "desc" } });
    const legacyRows = await client.executiveRecord.findMany({ where: { organizationId: scope.divisionId, kind: "STARTUP_APPLICATION", sourceKey: { startsWith: "startup:application:" }, status: statusFilter ? statusFilter : { in: [...statuses] }, createdAt: dateFilter, ...(legacyIds ? { id: { in: legacyIds } } : {}), ...(filters.program ? { payload: { contains: filters.program } } : {}), ...(search ? { OR: [{ title: { contains: search, mode: "insensitive" } }, { payload: { contains: search, mode: "insensitive" } }, { owner: { displayName: { contains: search, mode: "insensitive" } } }] } : {}) }, select: { id: true, ownerPersonId: true, status: true, version: true, payload: true, createdAt: true, updatedAt: true, history: { select: { reason: true }, orderBy: { createdAt: "desc" }, take: 20 }, owner: { select: { displayName: true, email: true, phone: true, users: { select: { emailVerifiedAt: true }, take: 1 } } } }, orderBy: { createdAt: "desc" } });
    const cases = [
      ...publicRows.map(row => {
        const referral = jsonObject(row.referralSnapshot);
        const verifiedReferral = typeof referral.verifiedReferral === "object" && referral.verifiedReferral ? "Verified referral" : referral.applicantProvided ? "Applicant provided" : "Not recorded";
        const aoRecommendation = row.events.find(event => event.action === "PUBLIC_APPLICATION_FORWARDED_TO_LEADERSHIP")?.reason ?? "";
        return { id: caseId("public", row.id), source: "PUBLIC_SIA" as const, reference: row.reference, applicantName: row.fullName ?? "Applicant", mobile: row.mobile ?? "", email: row.email ?? "", program: row.programPreference ?? "", district: row.district ?? "", state: row.state ?? "", city: row.city ?? "", preferredCentre: row.preferredCentre ?? "", referral: verifiedReferral, referralInfo: typeof referral.applicantProvided === "string" ? referral.applicantProvided : "", status: row.status, version: row.version, createdAt: row.submittedAt ?? row.createdAt, phoneVerified: !!row.phoneVerifiedAt, consentVersion: row.consentVersion, situation: row.entrepreneurialStage ?? "", idea: row.businessInterest ?? "", goals: row.goals ?? "", aoRecommendation, ownerPersonId: null as string | null };
      }),
      ...legacyRows.flatMap(row => { try { const payload = parseStartupApplicationPayload(row.payload); const aoRecommendation = row.history.find(item => item.reason.startsWith("AO forwarded to leadership:"))?.reason.replace(/^AO forwarded to leadership:\s*/, "") ?? ""; return [{ id: caseId("legacy", row.id), source: "LEGACY" as const, reference: row.id, applicantName: row.owner.displayName, mobile: row.owner.phone ?? "", email: row.owner.email ?? "", program: payload.tier, district: "", state: payload.location, preferredCentre: "", referral: payload.referral ? "Verified referral" : "Not recorded", referralInfo: "", status: row.status, version: row.version, createdAt: row.createdAt, phoneVerified: false, consentVersion: String(payload.noticeVersion), situation: payload.experience, idea: payload.idea, goals: payload.goal, aoRecommendation, ownerPersonId: row.ownerPersonId }]; } catch { return []; } })
    ];
    for (const row of cases) (row as typeof row & { assignedUserId?: string | null }).assignedUserId = assignmentMap.get(row.id)?.userId ?? null;
    const filtered = cases.filter(row => !district || `${row.district} ${row.state}`.toLocaleLowerCase().includes(district.toLocaleLowerCase())).filter(row => !referralFilter || (referralFilter === "verified" ? row.referral === "Verified referral" : referralFilter === "provided" ? row.referral === "Applicant provided" : row.referral === "Not recorded"));
    filtered.sort((a, b) => (filters.sort === "oldest" ? 1 : -1) * (a.createdAt.getTime() - b.createdAt.getTime()));
    return { cases: filtered, assignmentMap };
  }

  async function overview(scope: Scope, filters: Filters = {}) {
    const { cases } = await allCases(scope, filters);
    const counts = new Map<string, number>();
    for (const row of cases) counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
    const assignedAoReview = cases.filter(row => row.status === "SUBMITTED" && !!(row as typeof row & { assignedUserId?: string | null }).assignedUserId).length;
    const assignedFollowUp = cases.filter(row => ["CLARIFICATION_REQUIRED", "RETURNED_TO_AO"].includes(row.status)).length;
    const followups = await allFollowups(scope, new Set(cases.map(row => row.id)), false);
    const followupRequired = new Set(followups.filter(item => item.status !== "COMPLETED").map(item => item.caseId)).size;
    const submitted = counts.get("SUBMITTED") ?? 0;
    return { total: cases.length, new: submitted - assignedAoReview, underReview: assignedAoReview + assignedFollowUp, followupRequired, awaitingDecision: counts.get("IN_REVIEW") ?? 0, approved: counts.get("APPROVED") ?? 0, rejected: counts.get("REJECTED") ?? 0, clarificationRequired: counts.get("CLARIFICATION_REQUIRED") ?? 0 };
  }

  async function allFollowups(scope: Scope, caseIds?: Set<string>, all = false) {
    const publicApplicantIds = caseIds && !all ? [...caseIds].filter(id => id.startsWith("public:")).map(id => id.slice(7)) : undefined;
    const legacyAppIds = caseIds && !all ? new Set([...caseIds].filter(id => id.startsWith("legacy:")).map(id => id.slice(7))) : undefined;
    const publicRows = await client.startupAdmissionFollowUp.findMany({ where: { applicant: { organizationId: scope.companyId, ...(publicApplicantIds ? { id: { in: publicApplicantIds } } : {}) } }, select: { id: true, applicantId: true, actorUserId: true, contactMethod: true, outcome: true, note: true, nextFollowUpAt: true, status: true, createdAt: true, updatedAt: true }, orderBy: { nextFollowUpAt: "asc" }, take: 1000 });
    const legacyRows = await client.executiveRecord.findMany({ where: { organizationId: scope.divisionId, kind: "STARTUP_ADMISSION_FOLLOW_UP" }, select: { id: true, payload: true, dueAt: true, status: true, version: true, createdAt: true, updatedAt: true }, orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }] });
    return [
      ...publicRows.map(row => ({ id: row.id, caseId: caseId("public", row.applicantId), actorUserId: row.actorUserId, method: row.contactMethod ?? "OTHER", outcome: row.outcome ?? "Not recorded", note: row.note, dueAt: row.nextFollowUpAt, status: row.status, createdAt: row.createdAt, version: null as number | null })),
      ...legacyRows.flatMap(row => { const data = jsonObject(row.payload); const applicationId = data.applicationId; if (typeof applicationId !== "string" || legacyAppIds && !legacyAppIds.has(applicationId)) return []; return [{ id: row.id, caseId: caseId("legacy", applicationId), actorUserId: typeof data.actorUserId === "string" ? data.actorUserId : "", method: typeof data.contactMethod === "string" ? data.contactMethod : "OTHER", outcome: typeof data.outcome === "string" ? data.outcome : "Not recorded", note: typeof data.note === "string" ? data.note : "", dueAt: row.dueAt, status: row.status, createdAt: row.createdAt, version: row.version }]; })
    ].sort((a, b) => (a.dueAt?.getTime() ?? a.createdAt.getTime()) - (b.dueAt?.getTime() ?? b.createdAt.getTime()));
  }

  async function workspace(userId: string, raw: Filters & { caseId?: string; tasks?: string } = {}) { return workspaceFromScope(await portalScope(userId), raw); }

  async function detailById(scope: Scope, id: string) {
    const parsed = parseCaseId(id);
    if (parsed.source === "public") {
      const row = await client.startupPublicApplicant.findFirst({ where: { id: parsed.id, organizationId: scope.companyId, status: { in: [...statuses] }, submittedAt: { not: null } }, select: { id: true, reference: true, fullName: true, mobile: true, email: true, state: true, city: true, district: true, preferredCentre: true, programPreference: true, entrepreneurialStage: true, businessInterest: true, goals: true, referralSnapshot: true, phoneVerifiedAt: true, consentVersion: true, consentedAt: true, status: true, version: true, submittedAt: true, events: { select: { id: true, actorUserId: true, action: true, reason: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 50 }, assignments: { select: { id: true, assignedUserId: true, status: true, assignedAt: true, endedAt: true }, orderBy: { assignedAt: "desc" }, take: 30 }, followups: { select: { id: true, actorUserId: true, contactMethod: true, outcome: true, note: true, nextFollowUpAt: true, status: true, createdAt: true, updatedAt: true }, orderBy: { createdAt: "desc" }, take: 50 } } });
      if (!row) throw new AccessError("Application unavailable");
      const assigned = row.assignments.some(a => a.status === "ACTIVE" && a.assignedUserId === scope.userId);
      if (!scope.canManage && !assigned) throw new AccessError("Application is not assigned to this officer");
      const referral = jsonObject(row.referralSnapshot);
      const detail = { id, source: "PUBLIC_SIA" as const, reference: row.reference, applicantName: row.fullName ?? "Applicant", mobile: row.mobile ?? "", email: row.email ?? "", program: row.programPreference ?? "", state: row.state ?? "", city: row.city ?? "", district: row.district ?? "", preferredCentre: row.preferredCentre ?? "", situation: row.entrepreneurialStage ?? "", idea: row.businessInterest ?? "", goals: row.goals ?? "", referral: typeof referral.verifiedReferral === "object" && referral.verifiedReferral ? "Verified referral" : referral.applicantProvided ? "Applicant provided" : "Not recorded", referralInfo: typeof referral.applicantProvided === "string" ? referral.applicantProvided : "", status: row.status, version: row.version, submittedAt: row.submittedAt, verification: { mobile: !!row.phoneVerifiedAt, consentVersion: row.consentVersion, consentedAt: row.consentedAt }, history: row.events.map(e => ({ actorUserId: e.actorUserId, action: e.action, reason: e.reason ?? "", createdAt: e.createdAt })), assignments: row.assignments, followups: row.followups };
      return { ...detail, leadMatches: await prospectMatches(scope, "PUBLIC_SIA", row.id, row.mobile ?? "", row.email ?? "") };
    }
    const row = await client.executiveRecord.findFirst({ where: { id: parsed.id, organizationId: scope.divisionId, kind: "STARTUP_APPLICATION", sourceKey: { startsWith: "startup:application:" }, status: { in: [...statuses] } }, select: { id: true, ownerPersonId: true, status: true, version: true, payload: true, createdAt: true, owner: { select: { displayName: true, email: true, phone: true, users: { select: { emailVerifiedAt: true }, take: 1 } } }, history: { select: { actorUserId: true, fromStatus: true, toStatus: true, reason: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 50 } } });
    if (!row) throw new AccessError("Application unavailable");
    const assignments = await client.executiveRecord.findMany({ where: { organizationId: scope.divisionId, kind: "STARTUP_ADMISSION_ASSIGNMENT" }, select: { id: true, status: true, payload: true, createdAt: true, updatedAt: true }, orderBy: { createdAt: "desc" }, take: 1000 });
    const caseAssignments = assignments.filter(a => jsonObject(a.payload).applicationId === row.id).map(a => ({ id: a.id, assignedUserId: String(jsonObject(a.payload).assignedUserId ?? ""), status: a.status, assignedAt: a.createdAt, endedAt: a.status === "ACTIVE" ? null : a.updatedAt }));
    if (!scope.canManage && !caseAssignments.some(a => a.status === "ACTIVE" && a.assignedUserId === scope.userId)) throw new AccessError("Application is not assigned to this officer");
    const payload = parseStartupApplicationPayload(row.payload);
    const notes = (await client.executiveRecord.findMany({ where: { organizationId: scope.divisionId, kind: "STARTUP_ADMISSION_FOLLOW_UP" }, select: { id: true, status: true, payload: true, dueAt: true, createdAt: true, updatedAt: true, version: true }, orderBy: { createdAt: "desc" }, take: 500 })).filter(item => jsonObject(item.payload).applicationId === row.id).map(item => ({ id: item.id, actorUserId: String(jsonObject(item.payload).actorUserId ?? ""), contactMethod: String(jsonObject(item.payload).contactMethod ?? "OTHER"), outcome: String(jsonObject(item.payload).outcome ?? "Not recorded"), note: String(jsonObject(item.payload).note ?? ""), nextFollowUpAt: item.dueAt, status: item.status, createdAt: item.createdAt, updatedAt: item.updatedAt }));
    const detail = { id, source: "LEGACY" as const, reference: row.id, applicantName: row.owner.displayName, mobile: row.owner.phone ?? "", email: row.owner.email ?? "", program: payload.tier, state: payload.location, district: "", preferredCentre: "", situation: payload.experience, idea: payload.idea, goals: payload.goal, referral: payload.referral ? "Verified referral" : "Not recorded", referralInfo: "", status: row.status, version: row.version, submittedAt: row.createdAt, verification: { mobile: false, consentVersion: `Legacy notice ${payload.noticeVersion}`, consentedAt: null }, history: row.history.map(e => ({ actorUserId: e.actorUserId, action: e.toStatus, reason: e.reason, createdAt: e.createdAt })), assignments: caseAssignments, followups: notes };
    return { ...detail, leadMatches: await prospectMatches(scope, "LEGACY", row.id, row.owner.phone ?? "", row.owner.email ?? "") };
  }

  function contactDigits(value: string) { return value.replace(/\D/g, ""); }
  function applicationLeadLinkKey(source: "PUBLIC_SIA" | "LEGACY", applicationId: string) { return `startup:lead-application:${source}:${applicationId}`; }
  async function prospectMatches(scope: Scope, source: "PUBLIC_SIA" | "LEGACY", applicationId: string, mobile: string, email: string) {
    const [leadRows, linkRecord] = await Promise.all([
      client.executiveRecord.findMany({ where: { organizationId: scope.divisionId, kind: "STARTUP_PROSPECT_LEAD" }, select: { id: true, title: true, status: true, payload: true, updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 1000 }),
      client.executiveRecord.findUnique({ where: { sourceKey: applicationLeadLinkKey(source, applicationId) }, select: { id: true, status: true, payload: true, version: true, history: { select: { actorUserId: true, toStatus: true, reason: true, createdAt: true, actor: { select: { email: true } } }, orderBy: { createdAt: "desc" }, take: 30 } } }),
    ]);
    const linkPayload = linkRecord ? jsonObject(linkRecord.payload) : {};
    const priorCandidates = Array.isArray(linkPayload.candidates) ? linkPayload.candidates as Record<string, unknown>[] : [];
    const emailKey = email.trim().toLowerCase();
    const candidates = leadRows.flatMap(row => {
      const payload = jsonObject(row.payload);
      const phoneMatch = !!mobile && contactDigits(String(payload.phone ?? "")) === contactDigits(mobile);
      const emailMatch = !!emailKey && String(payload.email ?? "").trim().toLowerCase() === emailKey;
      const prior = priorCandidates.find(candidate => candidate.leadId === row.id);
      if (!phoneMatch && !emailMatch && !prior) return [];
      const dispositions = prior && Array.isArray(prior.decisions) ? prior.decisions as Record<string, unknown>[] : [];
      return [{ id: row.id, name: String(payload.name ?? row.title), status: row.status, source: String(payload.source ?? ""), campaign: String(payload.campaign ?? ""), programme: String(payload.programme ?? "UNDECIDED"), centre: String(payload.centre ?? ""), district: String(payload.district ?? ""), assignedCallerUserId: String(payload.assignedCallerUserId ?? ""), mobileMatch: phoneMatch, emailMatch, linked: linkPayload.linkedLeadId === row.id, dismissed: dispositions.some(decision => decision.decision === "NOT_A_MATCH"), callHistory: [] as { method: string; outcome: string; notes: string; createdAt: Date; caller: string }[] }];
    });
    const leadIds = candidates.map(candidate => candidate.id);
    if (leadIds.length) {
      const activities = await client.executiveRecord.findMany({ where: { organizationId: scope.divisionId, kind: "STARTUP_LEAD_ACTIVITY" }, select: { payload: true, status: true, createdAt: true, owner: { select: { displayName: true } } }, orderBy: { createdAt: "desc" }, take: 2000 });
      const activityByLead = new Map<string, typeof candidates[number]["callHistory"]>();
      for (const activity of activities) {
        const payload = jsonObject(activity.payload), leadId = typeof payload.leadId === "string" ? payload.leadId : "";
        if (!leadIds.includes(leadId)) continue;
        const rows = activityByLead.get(leadId) ?? [];
        rows.push({ method: String(payload.method ?? ""), outcome: String(payload.outcome ?? activity.status), notes: String(payload.notes ?? ""), createdAt: activity.createdAt, caller: activity.owner.displayName });
        activityByLead.set(leadId, rows);
      }
      for (const candidate of candidates) candidate.callHistory = activityByLead.get(candidate.id) ?? [];
    }
    return { linkedLeadId: typeof linkPayload.linkedLeadId === "string" ? linkPayload.linkedLeadId : null, recordId: linkRecord?.id ?? null, version: linkRecord?.version ?? 0, history: linkRecord?.history ?? [], candidates };
  }

  async function reviewLeadApplicationLink(userId: string, raw: unknown) {
    const scope = await portalScope(userId);
    if (!scope.canLinkLeads) throw new AccessError("Only an authorized Startup Skool AO or Director can review a lead match");
    const input = z.object({ caseId: z.string().min(8).max(180), leadId: z.string().min(10).max(100), decision: z.enum(["LINK", "NOT_A_MATCH"]), reason: z.string().trim().min(8).max(500) }).strict().parse(raw);
    const application = await detailById(scope, input.caseId);
    if (!application.leadMatches.candidates.some(candidate => candidate.id === input.leadId)) throw new AccessError("This lead is not an exact phone/email match for the application");
    const source = application.source;
    const rawApplicationId = application.id.split(":").at(-1)!;
    const key = applicationLeadLinkKey(source, rawApplicationId);
    return client.$transaction(async db => {
      const existing = await db.executiveRecord.findUnique({ where: { sourceKey: key }, select: { id: true, status: true, payload: true, version: true } });
      const payload = existing ? jsonObject(existing.payload) : { schemaVersion: 1, applicationSource: source, applicationId: rawApplicationId, applicationReference: application.reference, candidates: [] as Record<string, unknown>[] };
      if (payload.linkedLeadId && payload.linkedLeadId !== input.leadId) throw new AccessError("This application is already linked to another prospect");
      if (input.decision === "LINK") {
        const otherLinks = await db.executiveRecord.findMany({ where: { organizationId: scope.divisionId, kind: "STARTUP_LEAD_APPLICATION_LINK", status: "LINKED" }, select: { id: true, payload: true }, take: 2000 });
        if (otherLinks.some(link => { const p = jsonObject(link.payload); return p.linkedLeadId === input.leadId && p.applicationId !== rawApplicationId; })) throw new AccessError("This prospect is already linked to another application. Ask the AO to review the existing link.");
        payload.linkedLeadId = input.leadId;
      }
      const candidates = Array.isArray(payload.candidates) ? payload.candidates as Record<string, unknown>[] : [];
      const current = candidates.find(candidate => candidate.leadId === input.leadId);
      const decisions = current && Array.isArray(current.decisions) ? current.decisions as Record<string, unknown>[] : [];
      decisions.push({ decision: input.decision === "LINK" ? "LINKED" : "NOT_A_MATCH", reason: input.reason, actorUserId: userId, at: new Date().toISOString() });
      payload.candidates = [...candidates.filter(candidate => candidate.leadId !== input.leadId), { leadId: input.leadId, decisions }];
      const nextStatus = payload.linkedLeadId ? "LINKED" : "REVIEWED";
      const row = existing ? await db.executiveRecord.update({ where: { id: existing.id }, data: { payload: JSON.stringify(payload), status: nextStatus, version: { increment: 1 } } }) : await db.executiveRecord.create({ data: { kind: "STARTUP_LEAD_APPLICATION_LINK", organizationId: scope.divisionId, ownerPersonId: scope.personId, title: `Lead match review · ${application.reference}`, status: nextStatus, sourceKey: key, payload: JSON.stringify(payload) } });
      await db.executiveHistory.create({ data: { recordId: row.id, actorUserId: userId, fromStatus: existing?.status ?? null, toStatus: nextStatus, reason: `${input.decision === "LINK" ? "Linked prospect" : "Marked not the same person"}: ${input.reason}` } });
      if (source === "PUBLIC_SIA") await db.startupApplicationEvent.create({ data: { applicantId: rawApplicationId, actorUserId: userId, action: input.decision === "LINK" ? "PUBLIC_PROSPECT_LINKED" : "PUBLIC_PROSPECT_MATCH_DISMISSED", reason: input.reason, metadata: JSON.stringify({ leadId: input.leadId }) } });
      else await db.executiveHistory.create({ data: { recordId: rawApplicationId, actorUserId: userId, fromStatus: application.status, toStatus: application.status, reason: `${input.decision === "LINK" ? "Prospect linked" : "Possible prospect match dismissed"}: ${input.reason}` } });
      await operationalEvent(db, { actorUserId: userId, actorPersonId: scope.personId, organizationId: scope.divisionId, action: input.decision === "LINK" ? "startup.admissions.prospect_linked" : "startup.admissions.prospect_match_dismissed", entityType: "ExecutiveRecord", entityId: row.id, result: "SUCCESS", metadata: { applicationSource: source, leadId: input.leadId, applicationReference: application.reference } });
      return { linked: input.decision === "LINK" };
    }, { isolationLevel: "Serializable" });
  }

  async function possibleLeadMatchCounts(scope: Scope, cases: Awaited<ReturnType<typeof allCases>>["cases"]): Promise<Map<string, { possible: number; linked: boolean }>> {
    if (!cases.length) return new Map();
    const [leads, linkRecords] = await Promise.all([
      client.executiveRecord.findMany({ where: { organizationId: scope.divisionId, kind: "STARTUP_PROSPECT_LEAD" }, select: { id: true, payload: true }, take: 1000 }),
      client.executiveRecord.findMany({ where: { organizationId: scope.divisionId, kind: "STARTUP_LEAD_APPLICATION_LINK" }, select: { payload: true }, take: 2000 }),
    ]);
    const counts = new Map<string, { possible: number; linked: boolean }>();
    for (const row of cases) {
      const source = row.id.startsWith("public:") ? "PUBLIC_SIA" : "LEGACY", applicationId = row.id.split(":").at(-1) ?? row.id;
      const association = linkRecords.map(record => jsonObject(record.payload)).find(payload => payload.applicationSource === source && payload.applicationId === applicationId);
      const decisions = association && Array.isArray(association.candidates) ? association.candidates as Record<string, unknown>[] : [];
      const linked = typeof association?.linkedLeadId === "string";
      const count = linked ? 0 : leads.filter(lead => {
        const payload = jsonObject(lead.payload);
        const phoneMatch = !!row.mobile && contactDigits(String(payload.phone ?? "")) === contactDigits(row.mobile);
        const emailMatch = !!row.email && String(payload.email ?? "").trim().toLowerCase() === row.email.trim().toLowerCase();
        const prior = decisions.find(candidate => candidate.leadId === lead.id);
        const dismissed = !!prior && Array.isArray(prior.decisions) && (prior.decisions as Record<string, unknown>[]).some(decision => decision.decision === "NOT_A_MATCH");
        return !dismissed && (phoneMatch || emailMatch);
      }).length;
      counts.set(row.id, { possible: count, linked });
    }
    return counts;
  }

  async function assign(scope: Scope, raw: unknown) {
    if (!scope.canManage) throw new AccessError("Only an authorized Startup Director or Boss may assign officers");
    const input = assignmentInput.parse(raw), parsed = parseCaseId(input.caseId);
    if (input.assignedUserId) {
      const options = await officerOptions(scope);
      if (!options.some(o => o.id === input.assignedUserId)) throw new AccessError("Select an active verified Startup Skool Administrative Officer");
    }
    return client.$transaction(async db => {
      const actor = await db.user.findUnique({ where: { id: scope.userId }, select: { personId: true } });
      if (!actor?.personId || actor.personId !== scope.personId) throw new AccessError("Assignment authority unavailable");
      if (parsed.source === "public") {
        const row = await db.startupPublicApplicant.findFirst({ where: { id: parsed.id, organizationId: scope.companyId, status: { in: [...statuses] }, submittedAt: { not: null } }, select: { id: true, version: true } });
        if (!row) throw new AccessError("Application unavailable");
        await db.startupPublicApplicant.updateMany({ where: { id: row.id, version: row.version }, data: { version: { increment: 1 } } }).then(result => { if (result.count !== 1) throw new AccessError("Application changed; refresh before assigning"); });
        await db.startupAdmissionAssignment.updateMany({ where: { applicantId: row.id, status: "ACTIVE" }, data: { status: input.assignedUserId ? "REASSIGNED" : "UNASSIGNED", endedAt: new Date() } });
        if (input.assignedUserId) await db.startupAdmissionAssignment.create({ data: { applicantId: row.id, assignedUserId: input.assignedUserId, status: "ACTIVE" } });
        await db.startupApplicationEvent.create({ data: { applicantId: row.id, actorUserId: scope.userId, action: input.assignedUserId ? "PUBLIC_ADMISSIONS_OFFICER_ASSIGNED" : "PUBLIC_ADMISSIONS_OFFICER_UNASSIGNED", reason: input.reason, metadata: JSON.stringify({ assignedUserId: input.assignedUserId || null }) } });
      } else {
        const row = await db.executiveRecord.findFirst({ where: { id: parsed.id, organizationId: scope.divisionId, kind: "STARTUP_APPLICATION", sourceKey: { startsWith: "startup:application:" }, status: { in: [...statuses] } }, select: { id: true, ownerPersonId: true, version: true, status: true } });
        if (!row) throw new AccessError("Application unavailable");
        if ((await db.executiveRecord.updateMany({ where: { id: row.id, organizationId: scope.divisionId, version: row.version, status: row.status }, data: { version: { increment: 1 } } })).count !== 1) throw new AccessError("Application changed; refresh before assigning");
        const histories = await db.executiveRecord.findMany({ where: { organizationId: scope.divisionId, kind: "STARTUP_ADMISSION_ASSIGNMENT", status: "ACTIVE" }, select: { id: true, payload: true } });
        for (const h of histories) if (jsonObject(h.payload).applicationId === row.id) await db.executiveRecord.updateMany({ where: { id: h.id, status: "ACTIVE" }, data: { status: input.assignedUserId ? "REASSIGNED" : "UNASSIGNED", version: { increment: 1 } } });
        await db.executiveRecord.create({ data: { kind: "STARTUP_ADMISSION_ASSIGNMENT", organizationId: scope.divisionId, ownerPersonId: row.ownerPersonId, title: input.assignedUserId ? "Admissions officer assignment" : "Admissions officer unassigned", status: input.assignedUserId ? "ACTIVE" : "UNASSIGNED", sourceKey: `startup:admissions:assignment:${row.id}:${randomUUID()}`, payload: JSON.stringify({ schemaVersion: 1, applicationId: row.id, assignedUserId: input.assignedUserId || null, actorUserId: scope.userId, reason: input.reason }) } });
        await db.executiveHistory.create({ data: { recordId: row.id, actorUserId: scope.userId, fromStatus: row.status, toStatus: row.status, reason: `AO ${input.assignedUserId ? "assignment" : "unassignment"}: ${input.reason}` } });
      }
      await operationalEvent(db, { actorUserId: scope.userId, actorPersonId: scope.personId, organizationId: scope.divisionId, action: input.assignedUserId ? "startup.admissions.officer_assigned" : "startup.admissions.officer_unassigned", entityType: parsed.source === "public" ? "StartupPublicApplicant" : "ExecutiveRecord", entityId: parsed.id, result: "SUCCESS", metadata: { source: parsed.source, assignedUserId: input.assignedUserId || null } });
      return { assigned: !!input.assignedUserId };
    });
  }

  async function addFollowup(scope: Scope, raw: unknown) {
    const input = followupInput.parse(raw), parsed = parseCaseId(input.caseId);
    const detail = await detailById(scope, input.caseId);
    if (!["SUBMITTED", "IN_REVIEW", "CLARIFICATION_REQUIRED", "RETURNED_TO_AO"].includes(detail.status)) throw new AccessError("Follow-up is only available for an active application");
    return client.$transaction(async db => {
      const data = { applicantId: parsed.id, actorUserId: scope.userId, contactMethod: input.contactMethod, outcome: input.outcome, note: input.note, nextFollowUpAt: input.nextFollowUpAt ? new Date(input.nextFollowUpAt) : null, status: input.outcome === "CLARIFICATION_REQUIRED" ? "CLARIFICATION_REQUIRED" : "OPEN" };
      if (parsed.source === "public") await db.startupAdmissionFollowUp.create({ data });
      else {
        const row = await db.executiveRecord.findFirst({ where: { id: parsed.id, organizationId: scope.divisionId, kind: "STARTUP_APPLICATION" }, select: { ownerPersonId: true, status: true } });
        if (!row) throw new AccessError("Application unavailable");
        await db.executiveRecord.create({ data: { kind: "STARTUP_ADMISSION_FOLLOW_UP", organizationId: scope.divisionId, ownerPersonId: row.ownerPersonId, title: "Admissions follow-up", status: data.status, sourceKey: `startup:admissions:follow-up:${parsed.id}:${randomUUID()}`, dueAt: data.nextFollowUpAt, payload: JSON.stringify({ schemaVersion: 1, applicationId: parsed.id, actorUserId: scope.userId, contactMethod: input.contactMethod, outcome: input.outcome, note: input.note }) } });
      }
      if (parsed.source === "public") await db.startupApplicationEvent.create({ data: { applicantId: parsed.id, actorUserId: scope.userId, action: input.outcome === "CLARIFICATION_REQUIRED" ? "PUBLIC_CLARIFICATION_REQUIRED" : "PUBLIC_FOLLOW_UP_RECORDED", reason: input.note, metadata: JSON.stringify({ contactMethod: input.contactMethod, outcome: input.outcome, nextFollowUpAt: input.nextFollowUpAt ?? null }) } });
      else await db.executiveHistory.create({ data: { recordId: parsed.id, actorUserId: scope.userId, fromStatus: detail.status, toStatus: detail.status, reason: `Follow-up (${input.contactMethod}/${input.outcome}): ${input.note}` } });
      await operationalEvent(db, { actorUserId: scope.userId, actorPersonId: scope.personId, organizationId: scope.divisionId, action: "startup.admissions.follow_up_recorded", entityType: parsed.source === "public" ? "StartupPublicApplicant" : "ExecutiveRecord", entityId: parsed.id, result: "SUCCESS", metadata: { source: parsed.source, contactMethod: input.contactMethod, outcome: input.outcome, dueAt: input.nextFollowUpAt ?? null } });
      return { saved: true };
    });
  }

  async function completeFollowup(scope: Scope, raw: unknown) {
    const input = taskInput.parse(raw), parsed = parseCaseId(input.caseId);
    const detail = await detailById(scope, input.caseId);
    return client.$transaction(async db => {
      if (parsed.source === "public") {
        const result = await db.startupAdmissionFollowUp.updateMany({ where: { id: input.followUpId, applicantId: parsed.id, status: { in: ["OPEN", "CLARIFICATION_REQUIRED"] } }, data: { status: "COMPLETED" } });
        if (result.count !== 1) throw new AccessError("Follow-up changed or already completed");
        await db.startupApplicationEvent.create({ data: { applicantId: parsed.id, actorUserId: scope.userId, action: "PUBLIC_FOLLOW_UP_COMPLETED", metadata: JSON.stringify({ followUpId: input.followUpId }) } });
      } else {
        const item = await db.executiveRecord.findFirst({ where: { id: input.followUpId, organizationId: scope.divisionId, kind: "STARTUP_ADMISSION_FOLLOW_UP", status: { in: ["OPEN", "CLARIFICATION_REQUIRED"] } }, select: { id: true, version: true, payload: true, status: true } });
        if (!item || jsonObject(item.payload).applicationId !== parsed.id || (await db.executiveRecord.updateMany({ where: { id: item.id, version: item.version, status: item.status }, data: { status: "COMPLETED", version: { increment: 1 } } })).count !== 1) throw new AccessError("Follow-up changed or already completed");
        await db.executiveHistory.create({ data: { recordId: parsed.id, actorUserId: scope.userId, fromStatus: detail.status, toStatus: detail.status, reason: `Admissions follow-up completed: ${input.followUpId}` } });
      }
      await operationalEvent(db, { actorUserId: scope.userId, actorPersonId: scope.personId, organizationId: scope.divisionId, action: "startup.admissions.follow_up_completed", entityType: parsed.source === "public" ? "StartupPublicApplicant" : "ExecutiveRecord", entityId: parsed.id, result: "SUCCESS", metadata: { source: parsed.source, followUpId: input.followUpId } });
      return { completed: true };
    });
  }

  async function forward(scope: Scope, raw: unknown) {
    const input = forwardInput.parse(raw), parsed = parseCaseId(input.caseId);
    const detail = await detailById(scope, input.caseId);
    if (!scope.canManage && (!detail.assignments.some((a: { status: string; assignedUserId: string }) => a.status === "ACTIVE" && a.assignedUserId === scope.userId))) throw new AccessError("Only the assigned officer may forward this application");
    if (!["SUBMITTED", "CLARIFICATION_REQUIRED", "RETURNED_TO_AO"].includes(detail.status)) throw new AccessError("Application is already under review or has a final decision");
    if (detail.source === "PUBLIC_SIA" && (!detail.verification.mobile || detail.verification.consentVersion !== "startup-public-sia-v1")) throw new AccessError("Verified mobile and current applicant consent are required before forwarding");
    return client.$transaction(async db => {
      if (parsed.source === "public") {
        const updated = await db.startupPublicApplicant.updateMany({ where: { id: parsed.id, organizationId: scope.companyId, status: detail.status, version: detail.version, submittedAt: { not: null }, phoneVerifiedAt: { not: null }, consentVersion: "startup-public-sia-v1" }, data: { status: "IN_REVIEW", version: { increment: 1 } } });
        if (updated.count !== 1) throw new AccessError("Application changed. Refresh before forwarding");
        await db.startupApplicationEvent.create({ data: { applicantId: parsed.id, actorUserId: scope.userId, action: "PUBLIC_APPLICATION_FORWARDED_TO_LEADERSHIP", reason: input.reviewNote, metadata: JSON.stringify({ outcome: input.outcome, contactVerified: true, programReviewed: true, locationReviewed: true }) } });
      } else {
        const updated = await db.executiveRecord.updateMany({ where: { id: parsed.id, organizationId: scope.divisionId, kind: "STARTUP_APPLICATION", status: detail.status, version: detail.version }, data: { status: "IN_REVIEW", version: { increment: 1 } } });
        if (updated.count !== 1) throw new AccessError("Application changed. Refresh before forwarding");
        await db.executiveHistory.create({ data: { recordId: parsed.id, actorUserId: scope.userId, fromStatus: detail.status, toStatus: "IN_REVIEW", reason: `AO forwarded to leadership: ${input.reviewNote}` } });
      }
      await operationalEvent(db, { actorUserId: scope.userId, actorPersonId: scope.personId, organizationId: scope.divisionId, action: "startup.admissions.forwarded_to_leadership", entityType: parsed.source === "public" ? "StartupPublicApplicant" : "ExecutiveRecord", entityId: parsed.id, result: "SUCCESS", metadata: { source: parsed.source, verificationOutcome: input.outcome } });
      return { status: "IN_REVIEW" as const };
    });
  }

  async function page(userId: string, filters: Filters & { caseId?: string; tasks?: string } = {}) { return workspace(userId, filters); }
  async function pageForBoss(userId: string, brandId: string, filters: Filters & { caseId?: string; tasks?: string } = {}) {
    const scope = await bossScope(userId, brandId);
    const portalScopeFallback = await workspaceFromScope(scope, filters);
    return { ...portalScopeFallback, bossBrandId: brandId };
  }
  async function workspaceFromScope(scope: Scope, raw: Filters & { caseId?: string; tasks?: string }) {
    const requestedPage = Number(raw.page ?? 1);
    const filters = { ...raw, page: Number.isFinite(requestedPage) ? Math.max(1, Math.min(500, Math.trunc(requestedPage))) : 1 };
    const { cases, assignmentMap } = await allCases(scope, filters), pageSize = 20, start = (filters.page - 1) * pageSize;
    const selected = filters.caseId ? await detailById(scope, filters.caseId) : null;
    const leadMatchCounts = await possibleLeadMatchCounts(scope, cases);
    const nameCases = await allCases(scope, {}).then(result => result.cases);
    const followups = await allFollowups(scope, scope.canManage ? undefined : new Set(nameCases.map(row => row.id)), scope.canManage);
    const followupsWithNames = followups.map(item => ({ ...item, applicantName: nameCases.find(row => row.id === item.caseId)?.applicantName ?? "Assigned applicant" }));
    const officers = scope.canManage ? await officerOptions(scope) : [];
    const officerNames = new Map(officers.map(item => [item.id, item.name]));
    const recentByCase = new Map<string, typeof followupsWithNames[number]>();
    for (const item of [...followupsWithNames].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())) if (!recentByCase.has(item.caseId)) recentByCase.set(item.caseId, item);
    const today = new Date(); today.setHours(0,0,0,0); const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate()+1);
    const tasks = followupsWithNames.filter(i => filters.tasks === "completed" ? i.status === "COMPLETED" : i.status !== "COMPLETED").filter(i => filters.tasks === "overdue" ? !!i.dueAt && i.dueAt < today : filters.tasks === "upcoming" ? !!i.dueAt && i.dueAt >= tomorrow : filters.tasks === "completed" ? true : filters.tasks === "all" ? true : !!i.dueAt && i.dueAt >= today && i.dueAt < tomorrow);
    const taskCounts = { today: followups.filter(i => i.status !== "COMPLETED" && !!i.dueAt && i.dueAt >= today && i.dueAt < tomorrow).length, overdue: followups.filter(i => i.status !== "COMPLETED" && !!i.dueAt && i.dueAt < today).length, upcoming: followups.filter(i => i.status !== "COMPLETED" && !!i.dueAt && i.dueAt >= tomorrow).length, completed: followups.filter(i => i.status === "COMPLETED").length };
    return { scope, filters, overview: await overview(scope, filters), cases: cases.slice(start,start+pageSize).map(row=>{ const assignedUserId=assignmentMap.get(row.id)?.userId??null; const latest=recentByCase.get(row.id); const match=leadMatchCounts.get(row.id); return {...row,assignedUserId,assignedOfficer:assignedUserId?(officerNames.get(assignedUserId)??(assignedUserId===scope.userId?"You":"Assigned officer")):null,latestFollowup:latest?{outcome:latest.outcome,note:latest.note,createdAt:latest.createdAt}:null,leadMatchCount:match?.possible??0,leadLinked:match?.linked??false}; }), totalCases: cases.length, page: filters.page, pageSize, selected, followups: followupsWithNames, tasks, taskView: filters.tasks ?? "today", taskCounts, officers, canManage: scope.canManage, canLinkLeads: scope.canLinkLeads };
  }
  return { page, pageForBoss, assignPortal: async (userId: string, raw: unknown) => assign(await portalScope(userId), raw), assignBoss: async (userId: string, brandId: string, raw: unknown) => assign(await bossScope(userId, brandId), raw), addFollowup: async (userId: string, raw: unknown) => addFollowup(await portalScope(userId), raw), completeFollowup: async (userId: string, raw: unknown) => completeFollowup(await portalScope(userId), raw), forward: async (userId: string, raw: unknown) => forward(await portalScope(userId), raw), reviewLeadApplicationLink };
}

export const startupAdmissionsDesk = createStartupAdmissionsDesk();
