import { READ_BUDGET, boundedRead } from "@/server/domain/query-bounds";
import { createHash } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { AccessError, createAccessContext } from "@/server/authorization/engine";
import { activeMembershipWhere, ancestry } from "@/server/authorization/business-scope";
import { operationalEvent } from "@/server/domain/operational-events";
import { createOperationsService } from "@/server/domain/operations-service";
import { createExecutionService } from "@/server/domain/execution-service";
import { createCommunicationsService } from "@/server/communications/service";
import { messageInput } from "@/server/communications/input";
import { selection, conversationInput, personalityInput, defaultPersonality, memoryInput, actionInput, taskParameters } from "./input";
import { registeredTool, siaToolRegistry, type SiaResponse } from "./registry";
import { configuredProvider, type SiaProvider } from "./provider";
import { buildToolContext, memorySource, resolver, toolAuthority, type Selection, type Context } from "./context";
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
type DB = Prisma.TransactionClient;

export function createSiaService(client: PrismaClient = prisma, provider: SiaProvider = configuredProvider()) {
  async function event(db: DB, ctx: Context, s: Selection, action: string, entityType: string, entityId: string, metadata: Prisma.InputJsonObject = {}, failed = false) {
    return operationalEvent(db, { actorUserId: ctx.user!.id, actorPersonId: ctx.user!.personId, organizationId: s.organizationId, projectId: s.projectId, action, entityType, entityId, result: failed ? "FAILURE" : "SUCCESS", metadata: { siaId: s.siaId, ...metadata } });
  }
  async function human(db: DB, userId: string, s: Selection, capability = "sia.access.read") {
    const ctx = await createAccessContext(userId, db, undefined, s); await ctx.requireAccess(capability, s);
    if (!await db.siaIdentity.findFirst({ where: { id: s.siaId, status: "ACTIVE" } })) throw new AccessError("SIA unavailable");
    if (s.projectId) await ctx.requireAccess("project.read", s);
    return ctx;
  }
  async function manageIdentity(db: DB, userId: string, s: Selection) {
    const ctx = await human(db, userId, s, "sia.access.manage");
    // Personality and tool activation affect one shared identity, not just the selected branch.
    for (const a of await boundedRead(take => db.siaRoleAssignment.findMany({ take, where: { siaId: s.siaId }, include: { role: { include: { permissions: { take: READ_BUDGET + 1, include: { permission: true } } } } } }))) {
      await ctx.requireAccess("sia.access.manage", a);
      for (const p of a.role.permissions) await ctx.requireDelegation(p.permission, a, a.includeDescendants);
    }
    return ctx;
  }
  async function configure(userId: string, raw: unknown, configuration: unknown, expectedVersion: number) {
    const s = selection.parse(raw), value = personalityInput.parse(configuration);
    z.number().int().min(0).parse(expectedVersion);
    return client.$transaction(async db => {
      const ctx = await manageIdentity(db, userId, s);
      const update = await db.siaIdentity.updateMany({ where: { id: s.siaId, configurationVersion: expectedVersion }, data: { configuration: JSON.stringify(value), configurationVersion: { increment: 1 } } });
      if (update.count !== 1) throw new AccessError("Stale configuration");
      await event(db, ctx, s, "sia.configuration_changed", "SiaIdentity", s.siaId, { version: expectedVersion + 1 });
    });
  }
  async function setTool(userId: string, raw: unknown, key: string, enabled: boolean) {
    const s = selection.parse(raw), contract = registeredTool(key); z.boolean().parse(enabled);
    if (!contract) throw new AccessError("Tool not registered");
    return client.$transaction(async db => {
      const ctx = await manageIdentity(db, userId, s);
      await ctx.requireAccess(contract.requiredPermission, s);
      const row = await db.siaTool.upsert({ where: { siaId_key: { siaId: s.siaId, key } }, create: { siaId: s.siaId, key, name: contract.name, permissionKey: contract.requiredPermission, enabled }, update: { enabled, permissionKey: contract.requiredPermission } });
      await event(db, ctx, s, "sia.tool_configured", "SiaTool", row.id, { toolKey: key, enabled });
    });
  }
  async function saveMemory(userId: string, raw: unknown) {
    const v = memoryInput.parse(raw);
    return client.$transaction(async db => {
      const ctx = await human(db, userId, v, "sia.access.manage");
      if (!ctx.user?.personId) throw new AccessError("A human owner is required");
      if (v.category === "PROJECT" && !v.projectId) throw new AccessError("Project memory requires a project");
      if (v.category === "COMPANY" && ctx.nodes.find(n => n.id === v.organizationId)?.type !== "COMPANY") throw new AccessError("Company memory requires a company");
      if (v.category === "FOUNDER" && ctx.nodes.find(n => n.id === v.organizationId)?.type !== "GROUP") throw new AccessError("Founder memory requires an explicit group scope");
      const now = new Date();
      if (v.expiresAt && v.expiresAt <= now || v.reviewAt && v.reviewAt <= now) throw new AccessError("Memory review/expiry must be in the future");
      const path = ancestry(ctx.nodes, v.organizationId).map(n => n.id);
      if (!await db.membership.findFirst({ where: { ...activeMembershipWhere(), personId: ctx.user.personId, OR: [{ organizationId: v.organizationId, projectId: v.projectId ?? null }, { organizationId: { in: path }, projectId: null, scope: "DESCENDANTS" }] } })) throw new AccessError("Memory owner requires active membership");
      await memorySource(db, ctx, { organizationId: v.organizationId, projectId: v.projectId ?? null, sourceType: v.sourceType, sourceId: v.sourceId ?? null });
      const row = await db.siaContext.create({ data: { siaId: v.siaId, organizationId: v.organizationId, projectId: v.projectId, key: v.key, value: v.value, category: v.category, sourceType: v.sourceType, sourceId: v.sourceId, ownerPersonId: ctx.user.personId, confidence: v.confidence, reviewAt: v.reviewAt, expiresAt: v.expiresAt, status: "DRAFT" } });
      await event(db, ctx, v, "sia.memory_created", "SiaContext", row.id, { category: v.category, sourceType: v.sourceType });
      return row;
    });
  }
  async function reviewMemory(userId: string, id: string, expectedVersion: number, status: "APPROVED" | "ARCHIVED") {
    z.enum(["APPROVED", "ARCHIVED"]).parse(status); z.number().int().min(0).parse(expectedVersion);
    return client.$transaction(async db => {
      const row = await db.siaContext.findUnique({ where: { id } });
      if (!row?.organizationId || row.category === "LEGACY" || !row.ownerPersonId) throw new AccessError("Memory unavailable");
      const s = { siaId: row.siaId, organizationId: row.organizationId, ...(row.projectId ? { projectId: row.projectId } : {}) };
      const ctx = await human(db, userId, s, "sia.access.manage"); await memorySource(db, ctx, row);
      if (status === "APPROVED" && (row.status !== "DRAFT" || row.expiresAt && row.expiresAt <= new Date() || row.reviewAt && row.reviewAt <= new Date())) throw new AccessError("Memory cannot be approved");
      if (row.status === "ARCHIVED") throw new AccessError("Memory is already archived");
      if ((await db.siaContext.updateMany({ where: { id, version: expectedVersion, status: row.status }, data: { status, version: { increment: 1 } } })).count !== 1) throw new AccessError("Stale memory");
      await event(db, ctx, s, "sia.memory_reviewed", "SiaContext", id, { status, version: expectedVersion + 1 });
    });
  }
  async function propose(userId: string, raw: unknown) {
    const v = actionInput.parse(raw), fingerprint = hash(v);
    return client.$transaction(async db => {
      const ctx = await toolAuthority(db, userId, v, v.toolKey); await ctx.requireAccess("task.read", v);
      const h = await human(db, userId, v, "sia.propose");
      if (!h.user?.personId) throw new AccessError("Human requester required");
      const prior = await db.siaAction.findUnique({ where: { requesterUserId_siaId_idempotencyKey: { requesterUserId: userId, siaId: v.siaId, idempotencyKey: v.idempotencyKey } } });
      if (prior) { if (prior.fingerprint !== fingerprint || prior.requesterPersonId !== h.user.personId) throw new AccessError("Action replay mismatch"); return prior; }
      const request = await createOperationsService(client).createRequest(userId, { organizationId: v.organizationId, projectId: v.projectId, resourceType: v.projectId ? "PROJECT" : "ORGANIZATION", resourceId: v.projectId ?? v.organizationId, title: ("SIA: " + v.parameters.title).slice(0, 200), description: v.reason, controlPointId: v.controlPointId, idempotencyKey: "sia:" + hash({ siaId: v.siaId, key: v.idempotencyKey }).slice(0, 64) }, { siaId: v.siaId, toolKey: v.toolKey, payload: v.parameters }, db);
      const row = await db.siaAction.create({ data: { siaId: v.siaId, requesterUserId: userId, requesterPersonId: h.user.personId, organizationId: v.organizationId, projectId: v.projectId, toolKey: v.toolKey, parameters: JSON.stringify(v.parameters), reason: v.reason, risk: "LOW_RISK_WRITE", status: "APPROVAL_REQUIRED", authorization: "AUTHORIZED", approvalRequired: true, requestId: request.id, idempotencyKey: v.idempotencyKey, fingerprint } });
      const audit = await event(db, h, v, "sia.action_authorized", "SiaAction", row.id, { toolKey: row.toolKey, risk: row.risk, requestId: request.id });
      return db.siaAction.update({ where: { id: row.id }, data: { auditId: audit.auditId } });
    });
  }
  async function proposeCommunication(userId: string, rawSelection: unknown, rawMessage: unknown) {
    const s = selection.parse(rawSelection), message = messageInput.parse(rawMessage);
    if (message.organizationId !== s.organizationId || (message.projectId ?? null) !== (s.projectId ?? null)) throw new AccessError("SIA communication context mismatch");
    const integration = await client.integration.findUnique({ where: { id: message.integrationId } });
    const key = integration?.channel === "EMAIL" ? "send_email" : "send_whatsapp";
    await human(client, userId, s, "sia.propose");
    await toolAuthority(client, userId, s, key);
    return createCommunicationsService(client).propose(userId, message, s);
  }
  async function execute(userId: string, id: string, expectedVersion: number, confirmed: boolean) {
    z.number().int().min(0).parse(expectedVersion);
    if (confirmed !== true) throw new AccessError("Explicit human confirmation required");
    try { return await client.$transaction(async db => {
      const row = await db.siaAction.findUnique({ where: { id } });
      if (!row || row.requesterUserId !== userId || row.toolKey !== "create_task" || row.risk !== "LOW_RISK_WRITE" || !row.requestId) throw new AccessError("Action unavailable; high-impact execution is disabled");
      const s = { siaId: row.siaId, organizationId: row.organizationId, ...(row.projectId ? { projectId: row.projectId } : {}) };
      const ctx = await toolAuthority(db, userId, s, row.toolKey); await ctx.requireAccess("task.read", s);
      const h = await human(db, userId, s, "sia.propose");
      if (h.user?.personId !== row.requesterPersonId) throw new AccessError("Requester identity changed");
      const request = await db.operationalRequest.findUniqueOrThrow({ where: { id: row.requestId } });
      if (request.siaId !== row.siaId || request.toolKey !== row.toolKey || request.organizationId !== row.organizationId || request.projectId !== row.projectId || request.payload !== row.parameters || request.requesterUserId !== userId || request.description !== row.reason) throw new AccessError("Approval binding mismatch");
      const boundary = await createOperationsService(client).siaBoundary(userId, row.requestId, db);
      if (!boundary.humanApprovalValid || !boundary.permissionAllowed || !boundary.toolAllowed) throw new AccessError("Current independent human approval and tool authority required");
      if (row.status === "VERIFIED") return { id: row.resultId!, verificationStatus: "VERIFIED" as const };
      if (row.status !== "APPROVAL_REQUIRED" || row.version !== expectedVersion) throw new AccessError("Stale or non-executable action");
      if ((await db.siaAction.updateMany({ where: { id, status: "APPROVAL_REQUIRED", version: expectedVersion }, data: { status: "EXECUTING", version: { increment: 1 } } })).count !== 1) throw new AccessError("Action already claimed");
      await event(db, h, s, "sia.action_approved", "SiaAction", id, { requestId: request.id });
      const parameters = taskParameters.parse(JSON.parse(row.parameters));
      const task = await createExecutionService(client, resolver(s)).save(userId, "tasks", { ...parameters, organizationId: s.organizationId, projectId: s.projectId, status: "TODO" }, undefined, db);
      const actual = await db.task.findUniqueOrThrow({ where: { id: task.id } });
      if (actual.organizationId !== s.organizationId || actual.projectId !== (s.projectId ?? null) || actual.title !== parameters.title || actual.status !== "TODO") throw new AccessError("Verification failed");
      await event(db, h, s, "sia.action_executed", "SiaAction", id, { resultId: actual.id });
      const audit = await event(db, h, s, "sia.action_verified", "SiaAction", id, { resultId: actual.id });
      await db.siaAction.update({ where: { id }, data: { status: "VERIFIED", resultId: actual.id, verificationStatus: "VERIFIED", executedAt: new Date(), verifiedAt: new Date(), auditId: audit.auditId, version: { increment: 1 } } });
      return { id: actual.id, verificationStatus: "VERIFIED" as const };
    }); } catch (e) {
      if (e instanceof AccessError) throw e;
      await client.$transaction(async db => {
        const row = await db.siaAction.findUnique({ where: { id } });
        if (!row || row.requesterUserId !== userId) throw new AccessError("Action unavailable");
        const s = { siaId: row.siaId, organizationId: row.organizationId, ...(row.projectId ? { projectId: row.projectId } : {}) };
        const ctx = await toolAuthority(db, userId, s, row.toolKey);
        await event(db, ctx, s, "sia.action_failed", "SiaAction", id, { failureCode: "EXECUTION_FAILED", outputsRolledBack: true }, true);
        await db.siaAction.update({ where: { id }, data: { failureCode: "EXECUTION_FAILED" } });
      });
      throw new AccessError("Execution failed. Outputs rolled back; no successful execution is claimed.");
    }
  }
  async function converse(userId: string, raw: unknown): Promise<SiaResponse> {
    const v = conversationInput.parse(raw), started = Date.now();
    const ctx = await human(client, userId, v); await ctx.requireAccess("executive.read", v);
    const fingerprint = hash(v);
    let run = await client.$transaction(async db => {
      const h = await human(db, userId, v);
      const prior = await db.siaRun.findUnique({ where: { userId_siaId_idempotencyKey: { userId, siaId: v.siaId, idempotencyKey: v.idempotencyKey } } });
      if (prior) { if (prior.fingerprint !== fingerprint) throw new AccessError("Conversation replay mismatch"); return prior; }
      const r = await db.siaRun.create({ data: { siaId: v.siaId, userId, organizationId: v.organizationId, projectId: v.projectId, idempotencyKey: v.idempotencyKey, fingerprint, intent: "PENDING", provider: provider.name, model: provider.model, status: "PROCESSING" } });
      await event(db, h, v, "sia.request_started", "SiaRun", r.id);
      return r;
    });
    try {
      const selected = await provider.selectIntent(v.message), tool = selected.toolKey && registeredTool(selected.toolKey);
      if (!tool) throw new AccessError("UNSUPPORTED_INTENT");
      let result: SiaResponse;
      if (tool.risk !== "READ_ONLY") {
        await toolAuthority(client, userId, v, tool.key);
        result = { facts: [], signals: [], recommendations: [], actions: ["Prepare a task proposal with its title, scope, reason and independent approval policy. No task has been created."], approvals: [], limitations: ["Deterministic development mode. Natural language cannot execute a write."], provider: provider.name, calculatedAt: new Date().toISOString(), context: {} };
      } else result = await buildToolContext(client, userId, v, tool.key);
      // Results are live, never a cached snapshot that could survive revocation.
      const fresh = await toolAuthority(client, userId, v, tool.key);
      await client.$transaction(async db => {
        const h = await human(db, userId, v); await toolAuthority(db, userId, v, tool.key);
        if (run.status !== "SUCCEEDED") {
          await event(db, h, v, "sia.context_retrieved", "SiaRun", run.id, { toolKey: tool.key, authorization: "AUTHORIZED", facts: result.facts.length, signals: result.signals.length });
          await event(db, h, v, "sia.tool_selected", "SiaRun", run.id, { toolKey: tool.key, risk: tool.risk });
          if (result.recommendations.length) await event(db, h, v, "sia.recommendation_generated", "SiaRun", run.id, { count: result.recommendations.length });
          const audit = await event(db, h, v, "sia.tool_completed", "SiaRun", run.id, { toolKey: tool.key });
          run = await db.siaRun.update({ where: { id: run.id }, data: { status: "SUCCEEDED", toolKey: tool.key, intent: tool.key, latencyMs: Date.now() - started, inputTokens: selected.inputTokens, outputTokens: selected.outputTokens, estimatedCost: selected.estimatedCost, failureCode: null, auditId: audit.auditId, rationale: JSON.stringify({ conclusion: "Authorized domain evidence retrieved", evidence: result.recommendations.flatMap(r => r.evidence), type: "CONCISE_RATIONALE_NOT_CHAIN_OF_THOUGHT" }) } });
        }
      });
      if (!fresh.active) throw new AccessError("Access denied");
      return result;
    } catch (e) {
      const failureCode = e instanceof AccessError && e.message === "UNSUPPORTED_INTENT" ? "UNSUPPORTED_INTENT" : provider.name === "UNAVAILABLE" ? "MODEL_UNAVAILABLE" : e instanceof AccessError ? "TOOL_OR_ACCESS_UNAVAILABLE" : "DATA_UNAVAILABLE";
      await client.$transaction(async db => {
        const h = await human(db, userId, v);
        await db.siaRun.update({ where: { id: run.id }, data: { status: "FAILED", failureCode, latencyMs: Date.now() - started } });
        await event(db, h, v, "sia.request_failed", "SiaRun", run.id, { failureCode }, true);
      });
      throw new AccessError(failureCode === "UNSUPPORTED_INTENT" ? "Request not supported in deterministic mode. Choose a registered business question." : failureCode === "MODEL_UNAVAILABLE" ? "Model unavailable. No answer or action was invented." : "Tool, authorized context or data unavailable. No business action was executed.");
    }
  }
  async function workspace(userId: string, raw?: unknown) {
    const ctx = await createAccessContext(userId, client);
    if (!ctx.active) throw new AccessError("Access denied");
    const ids = ctx.organizationIds("sia.access.read").filter(id => ctx.organizationIds("executive.read").includes(id));
    const organizations = await boundedRead(take => client.organization.findMany({ take, where: { id: { in: ids.filter(id => ctx.organizationIds("organization.read").includes(id)) } }, select: { id: true, name: true, type: true } }));
    const projects = (await createExecutionService(client).workspace(userId)).projects.filter(p => ctx.organizationIds("sia.access.read").includes(p.organizationId) || ctx.grants.some(g => g.key === "sia.access.read" && g.projectId === p.id));
    const identities = ids.length || projects.length ? await boundedRead(take => client.siaIdentity.findMany({ take, select: { id: true, name: true, title: true, status: true } })) : [];
    if (!raw) return { organizations, projects, identities, current: null };
    const s = selection.parse(raw); await human(client, userId, s); await ctx.requireAccess("executive.read", s);
    const identity = await client.siaIdentity.findUniqueOrThrow({ where: { id: s.siaId } });
    const access = await createAccessContext(userId, client, s);
    const memories = [];
    for (const m of await client.siaContext.findMany({ where: { siaId: s.siaId, organizationId: s.organizationId, ...(s.projectId ? { projectId: s.projectId } : {}) }, orderBy: { updatedAt: "desc" }, take: 100 })) {
      try { await memorySource(client, ctx, m); memories.push({ id: m.id, category: m.category, key: m.key, value: m.value, status: m.status, version: m.version, sourceType: m.sourceType, sourceId: m.sourceId, confidence: m.confidence, reviewAt: m.reviewAt, expiresAt: m.expiresAt }); } catch (e) { if (!(e instanceof AccessError)) throw e; }
    }
    const actions = [];
    for (const a of await client.siaAction.findMany({ where: { siaId: s.siaId, requesterUserId: userId, organizationId: s.organizationId, projectId: s.projectId ?? null }, include: { request: { select: { status: true } } }, orderBy: { createdAt: "desc" }, take: 50 })) {
      if ((await ctx.decide("task.read", a)).allowed && (await access.decide("task.read", a)).allowed) actions.push({ id: a.id, parameters: taskParameters.parse(JSON.parse(a.parameters)), reason: a.reason, risk: a.risk, status: a.request && ["REJECTED", "CANCELLED", "EXPIRED"].includes(a.request.status) ? a.request.status : a.status, approvalStatus: a.request?.status ?? "UNAVAILABLE", requestId: a.requestId, version: a.version, resultId: a.resultId, verificationStatus: a.verificationStatus });
    }
    const enabled = await boundedRead(take => client.siaTool.findMany({ take, where: { siaId: s.siaId } }));
    const tools = [];
    for (const t of siaToolRegistry) tools.push({ key: t.key, name: t.name, risk: t.risk, permission: t.requiredPermission, enabled: enabled.some(e => e.key === t.key && e.enabled && e.permissionKey === t.requiredPermission), available: (await access.decide(t.requiredPermission, s)).allowed, approvalRequired: t.requiresApproval });
    const policies = await boundedRead(take => client.controlPoint.findMany({ take, where: { organizationId: s.organizationId, projectId: s.projectId ?? null, status: "ACTIVE", kind: { in: ["APPROVAL", "HUMAN_DECISION"] }, allowSelfApproval: false }, select: { id: true, name: true } }));
    const runs = await client.siaRun.findMany({ where: { siaId: s.siaId, userId, organizationId: s.organizationId, projectId: s.projectId ?? null }, select: { id: true, toolKey: true, status: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 30 });
    let canConfigure = false; try { await manageIdentity(client, userId, s); canConfigure = true; } catch (e) { if (!(e instanceof AccessError)) throw e; }
    return { organizations, projects, identities, current: { selection: s, identity: { name: identity.name, title: identity.title, status: identity.status, description: identity.description, configuration: identity.configuration ? personalityInput.parse(JSON.parse(identity.configuration)) : defaultPersonality, configurationVersion: identity.configurationVersion }, tools, memories, actions, runs, policies: (await ctx.decide("control.read", s)).allowed ? policies : [], canConfigure, canManageMemory: (await ctx.decide("sia.access.manage", s)).allowed, highImpactExecutionEnabled: false } };
  }
  async function preview(userId: string, raw: unknown, toolKey: string) {
    const s = selection.parse(raw), tool = registeredTool(toolKey);
    if (!tool || tool.risk !== "READ_ONLY") throw new AccessError("Read-only tool required");
    return buildToolContext(client, userId, s, toolKey);
  }
  async function usage(userId: string, raw: unknown) {
    const s = selection.parse(raw), ctx = await human(client, userId, s, "sia.access.manage");
    await ctx.requireAccess("executive.read", s);
    const where = { siaId: s.siaId, organizationId: s.organizationId, projectId: s.projectId ?? null };
    const aggregate = await client.siaRun.aggregate({ where, _count: true, _sum: { inputTokens: true, outputTokens: true, estimatedCost: true }, _avg: { latencyMs: true } });
    const providers = await client.siaRun.groupBy({ by: ["provider", "model", "status"], where, _count: true });
    return { requests: aggregate._count, inputTokens: aggregate._sum.inputTokens, outputTokens: aggregate._sum.outputTokens, estimatedCost: aggregate._sum.estimatedCost, averageLatencyMs: aggregate._avg.latencyMs, providers };
  }
  return { proposeCommunication, workspace, configure, setTool, saveMemory, reviewMemory, propose, execute, converse, preview, usage };
}
export const siaService = createSiaService();
