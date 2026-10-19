import { createHash } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { AccessError, createAccessContext } from "@/server/authorization/engine";
import { operationalEvent } from "@/server/domain/operational-events";
import { createBossService } from "./boss-service";
import { createSiaService } from "@/server/sia/service";
import { createOperationsService } from "@/server/domain/operations-service";
import { toolAuthority } from "@/server/sia/context";
import { taskParameters } from "@/server/sia/input";

type DB = Prisma.TransactionClient;
const nexaId = "79c75108-71f4-4ae3-90ba-a142f474e4e0";
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const instructionInput = z.object({ organizationId: z.string().min(1), directorUserId: z.string().min(1), instruction: z.string().trim().min(10).max(3000), directorBrief: z.string().trim().min(10).max(2000), idempotencyKey: z.string().min(8).max(120) }).strict();
const taskInput = z.object({ id: z.string().min(1), version: z.number().int().min(0), controlPointId: z.string().min(1), parameters: taskParameters }).strict();

export function createNexaService(client: PrismaClient = prisma) {
  const boss = createBossService(client);
  async function company(db: DB, groupId: string, organizationId: string) {
    const row = await db.organization.findUnique({ where: { id: organizationId }, select: { id: true, name: true, type: true, status: true, parentId: true } });
    if (!row || row.type !== "COMPANY" || row.status !== "ACTIVE" || row.parentId !== groupId) throw new AccessError("Company scope unavailable");
    return row;
  }
  async function director(db: DB, userId: string, organizationId: string) {
    const user = await db.user.findUnique({ where: { id: userId }, select: { emailVerifiedAt: true, status: true, personId: true, person: { select: { status: true } } } });
    if (!user?.emailVerifiedAt || user.status !== "ACTIVE" || user.person?.status !== "ACTIVE" || !user.personId) throw new AccessError("Verified director account required");
    const membership = await db.membership.findFirst({ where: { personId: user.personId, organizationId, projectId: null, status: "ACTIVE", roles: { some: { role: { name: "Director", status: "ACTIVE", principalType: "HUMAN", organizationId } } } } });
    if (!membership) throw new AccessError("Director appointment unavailable");
    const ctx = await createAccessContext(userId, db, undefined, { organizationId });
    for (const key of ["organization.read", "executive.read", "decision.decide"]) await ctx.requireAccess(key, { organizationId });
    return ctx;
  }
  async function audit(db: DB, userId: string, organizationId: string, action: string, directiveId: string, metadata: Prisma.InputJsonObject = {}) {
    const actor = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { personId: true } });
    return operationalEvent(db, { actorUserId: userId, actorPersonId: actor.personId, organizationId, action, entityType: "GroupDirective", entityId: directiveId, result: "SUCCESS", metadata });
  }
  async function create(userId: string, raw: unknown) {
    const input = instructionInput.parse(raw), fingerprint = digest(input);
    return client.$transaction(async db => {
      const { root, ctx } = await boss.authority(userId, db);
      await company(db, root.id, input.organizationId);
      await ctx.requireAccess("organization.read", { organizationId: input.organizationId });
      await ctx.requireAccess("decision.manage", { organizationId: input.organizationId });
      await director(db, input.directorUserId, input.organizationId);
      const prior = await db.nexaDirective.findUnique({ where: { bossUserId_idempotencyKey: { bossUserId: userId, idempotencyKey: input.idempotencyKey } } });
      if (prior) { if (prior.fingerprint !== fingerprint) throw new AccessError("Directive replay mismatch"); return prior; }
      const identity = await db.nexaIdentity.findUnique({ where: { id: nexaId } });
      if (identity && (identity.name !== "NEXA" || identity.status !== "ACTIVE")) throw new AccessError("Group agent unavailable");
      if (!identity) {
        await db.nexaIdentity.create({ data: { id: nexaId, name: "NEXA" } });
        await operationalEvent(db, { actorUserId: userId, organizationId: root.id, action: "group.agent_registered", entityType: "GroupAgent", entityId: nexaId, result: "SUCCESS" });
      }
      const groupPlan = JSON.stringify({ source: "BOSS_INSTRUCTION", generation: "STRUCTURED_DRAFT", scope: input.organizationId, responsibleHumanUserId: input.directorUserId, objective: input.instruction, approvalBoundary: "DIRECTOR_DECISION_THEN_INDEPENDENT_CONTROL" });
      const row = await db.nexaDirective.create({ data: { nexaId, bossUserId: userId, directorUserId: input.directorUserId, organizationId: input.organizationId, bossInstruction: input.instruction, groupPlan, directorBrief: input.directorBrief, idempotencyKey: input.idempotencyKey, fingerprint } });
      await audit(db, userId, input.organizationId, "group.directive_created", row.id, { responsibleHumanUserId: input.directorUserId, source: "BOSS_INSTRUCTION" });
      return row;
    });
  }
  async function bossDesk(userId: string) {
    const { root, ctx } = await boss.authority(userId);
    const companies = await client.organization.findMany({ where: { parentId: root.id, type: "COMPANY", status: "ACTIVE", id: { in: ctx.organizationIds("decision.manage").filter(id => ctx.organizationIds("organization.read").includes(id)) } }, select: { id: true, name: true }, take: 25, orderBy: { name: "asc" } });
    const directors = [];
    const candidates = await client.user.findMany({ where: { status: "ACTIVE", emailVerifiedAt: { not: null }, person: { memberships: { some: { organizationId: { in: companies.map(c => c.id) }, status: "ACTIVE", roles: { some: { role: { name: "Director", principalType: "HUMAN", status: "ACTIVE" } } } } } } }, select: { id: true, email: true }, take: 100, orderBy: { email: "asc" } });
    for (const candidate of candidates) for (const companyRow of companies) {
      try { await director(client, candidate.id, companyRow.id); directors.push({ id: candidate.id, email: candidate.email, organizationId: companyRow.id }); }
      catch (error) { if (!(error instanceof AccessError)) throw error; }
    }
    const directives = await client.nexaDirective.findMany({ where: { bossUserId: userId, organizationId: { in: companies.map(c => c.id) } }, include: { organization: { select: { name: true } }, director: { select: { email: true } }, action: { select: { id: true, status: true, resultId: true, request: { select: { status: true } } } } }, orderBy: { createdAt: "desc" }, take: 50 });
    return { identity: await client.nexaIdentity.findUnique({ where: { id: nexaId }, select: { status: true } }), companies, directors, directives };
  }
  async function directorDesk(userId: string, organizationId: string) {
    const ctx = await director(client, userId, organizationId);
    const rows = await client.nexaDirective.findMany({ where: { directorUserId: userId, organizationId }, select: { id: true, directorBrief: true, status: true, outcome: true, version: true, siaId: true, siaPreparation: true, decisionReason: true, createdAt: true, action: { select: { id: true, status: true, resultId: true, request: { select: { status: true } } } } }, orderBy: { createdAt: "desc" }, take: 25 });
    const identities = await client.siaIdentity.findMany({ where: { status: "ACTIVE", tools: { some: { key: "get_company_overview", enabled: true, permissionKey: "company.read" } } }, select: { id: true, name: true }, take: 20 });
    const sia = [];
    for (const identity of identities) {
      try { await toolAuthority(client, userId, { siaId: identity.id, organizationId }, "get_company_overview"); sia.push(identity); }
      catch (error) { if (!(error instanceof AccessError)) throw error; }
    }
    const canPropose = (await ctx.decide("request.manage", { organizationId })).allowed && (await ctx.decide("control.read", { organizationId })).allowed && (await ctx.decide("sia.propose", { organizationId })).allowed && (await ctx.decide("task.read", { organizationId })).allowed && (await ctx.decide("task.manage", { organizationId })).allowed;
    const controls = canPropose ? await client.controlPoint.findMany({ where: { organizationId, projectId: null, kind: "APPROVAL", status: "ACTIVE", allowSelfApproval: false, requiredPermission: "task.manage", rules: { some: {} } }, select: { id: true, name: true }, take: 25 }) : [];
    const visibleRows = [];
    for (const row of rows) {
      let currentPreparation = false;
      if (row.siaId && row.siaPreparation) {
        try { await toolAuthority(client, userId, { siaId: row.siaId, organizationId }, "get_company_overview"); currentPreparation = true; }
        catch (error) { if (!(error instanceof AccessError)) throw error; }
      }
      visibleRows.push({ ...row, siaPreparation: currentPreparation ? row.siaPreparation : null, preparationCurrent: currentPreparation });
    }
    return { rows: visibleRows, sia, controls };
  }
  async function prepare(userId: string, id: string, siaId: string, version: number) {
    z.number().int().min(0).parse(version);
    const row = await client.nexaDirective.findUnique({ where: { id } });
    if (!row || row.directorUserId !== userId || row.status !== "DIRECTOR_REVIEW" || row.version !== version) throw new AccessError("Directive unavailable or changed");
    await director(client, userId, row.organizationId);
    const scope = { siaId, organizationId: row.organizationId };
    const result = await createSiaService(client).preview(userId, scope, "get_company_overview");
    const summary = JSON.stringify({ source: "SIA_READ_ONLY_CONTEXT", calculatedAt: result.calculatedAt, facts: result.facts.slice(0, 8).map(f => ({ label: f.label.slice(0, 120), value: f.value, source: f.source })), recommendations: result.recommendations.slice(0, 3).map(r => ({ observation: r.observation, recommendation: r.recommendation, evidence: r.evidence })), limitations: result.limitations.slice(0, 5) });
    if (Buffer.byteLength(summary) > 16000) throw new AccessError("Preparation exceeds safe size");
    return client.$transaction(async db => {
      await director(db, userId, row.organizationId);
      await toolAuthority(db, userId, scope, "get_company_overview");
      if ((await db.nexaDirective.updateMany({ where: { id, version, status: "DIRECTOR_REVIEW", directorUserId: userId, organizationId: row.organizationId }, data: { status: "PREPARED", siaId, siaPreparation: summary, preparedAt: new Date(), outcome: "AWAITING_HUMAN_DECISION", version: { increment: 1 } } })).count !== 1) throw new AccessError("Directive changed");
      await audit(db, userId, row.organizationId, "group.directive_prepared", id, { siaId, source: "AUTHORIZED_READ_ONLY_CONTEXT", responsibleHumanUserId: userId });
    });
  }
  async function decide(userId: string, id: string, version: number, decision: "APPROVED" | "REJECTED", reason: string) {
    z.number().int().min(0).parse(version); z.enum(["APPROVED", "REJECTED"]).parse(decision);
    const comment = z.string().trim().min(10).max(2000).parse(reason);
    return client.$transaction(async db => {
      const row = await db.nexaDirective.findUnique({ where: { id } });
      if (!row || row.directorUserId !== userId || row.status !== "PREPARED" || row.version !== version || !row.siaId) throw new AccessError("Prepared directive unavailable or changed");
      await director(db, userId, row.organizationId);
      await toolAuthority(db, userId, { siaId: row.siaId, organizationId: row.organizationId }, "get_company_overview");
      const status = decision === "APPROVED" ? "DIRECTOR_APPROVED" : "REJECTED";
      if ((await db.nexaDirective.updateMany({ where: { id, status: "PREPARED", version }, data: { status, outcome: decision === "APPROVED" ? "CONTROLLED_REQUEST_REQUIRED" : "REJECTED_BY_DIRECTOR", decisionReason: comment, decidedAt: new Date(), version: { increment: 1 } } })).count !== 1) throw new AccessError("Directive changed");
      await audit(db, userId, row.organizationId, decision === "APPROVED" ? "group.directive_approved" : "group.directive_rejected", id, { decision, responsibleHumanUserId: userId });
    });
  }
  async function proposeTask(userId: string, raw: unknown) {
    const input = taskInput.parse(raw);
    return client.$transaction(async db => {
      const row = await db.nexaDirective.findUnique({ where: { id: input.id } });
      if (!row || row.directorUserId !== userId || row.status !== "DIRECTOR_APPROVED" || row.version !== input.version || !row.siaId) throw new AccessError("Approved directive unavailable or changed");
      await director(db, userId, row.organizationId);
      const action = await createSiaService(client).proposeWithin(db, userId, { siaId: row.siaId, organizationId: row.organizationId, toolKey: "create_task", controlPointId: input.controlPointId, parameters: input.parameters, reason: `Director directive ${row.id}: ${row.directorBrief.slice(0, 800)}`, idempotencyKey: `directive:${row.id}` });
      if (!action.requestId) throw new AccessError("Approval request unavailable");
      await createOperationsService(client).submitRequest(userId, action.requestId, db);
      if ((await db.nexaDirective.updateMany({ where: { id: row.id, status: "DIRECTOR_APPROVED", version: input.version, actionId: null }, data: { actionId: action.id, status: "ACTION_PROPOSED", outcome: "INDEPENDENT_APPROVAL_REQUIRED", version: { increment: 1 } } })).count !== 1) throw new AccessError("Directive changed");
      await audit(db, userId, row.organizationId, "group.directive_action_proposed", row.id, { siaId: row.siaId, actionId: action.id, requestId: action.requestId, responsibleHumanUserId: userId, approvalState: "SUBMITTED" });
      return action;
    });
  }
  return { create, bossDesk, directorDesk, prepare, decide, proposeTask };
}

export const nexaService = createNexaService();
