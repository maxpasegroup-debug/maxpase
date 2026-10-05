import { boundedRead, resultPage } from "@/server/domain/query-bounds";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { PrismaClient, Integration, CommunicationMessage } from "@prisma/client";
import { prisma } from "@/server/db";
import { AccessError, createAccessContext, type AgentConstraint } from "@/server/authorization/engine";
import { ancestry, activeMembershipWhere } from "@/server/authorization/business-scope";
import { boundResource, type DB, type Context } from "@/server/domain/operations-scope";
import { operationalEvent } from "@/server/domain/operational-events";
import { createOperationsService } from "@/server/domain/operations-service";
import { inspectSiaToolAccess } from "@/server/sia/access";
import * as input from "./input";
import { environmentCredentials, registeredAdapter, type CredentialResolver, type CommunicationAdapter, type DeliveryResult } from "./providers";

export const fingerprint = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
export async function rateLimit(db: DB, organizationId: string, key: string, limit: number, windowMs: number, now = new Date()) {
  const window = Math.floor(now.getTime() / windowMs);
  const unique = organizationId + ":" + key + ":" + window;
  await db.communicationRateBucket.upsert({ where: { key: unique }, create: { organizationId, key: unique, expiresAt: new Date((window + 1) * windowMs) }, update: {} });
  if ((await db.communicationRateBucket.updateMany({ where: { key: unique, count: { lt: limit } }, data: { count: { increment: 1 } } })).count !== 1) throw new AccessError("Rate limit reached");
}
export async function communicationAudit(db: DB, ctx: Context | null, scope: { organizationId: string; projectId?: string | null }, action: string, entityType: string, entityId: string, failed = false) {
  return operationalEvent(db, { actorUserId: ctx?.user?.id, actorPersonId: ctx?.user?.personId, organizationId: scope.organizationId, projectId: scope.projectId, action, entityType, entityId, result: failed ? "FAILURE" : "SUCCESS", metadata: { origin: ctx ? "DOMAIN_MUTATION" : failed ? "UNVERIFIED_INTEGRATION" : "VERIFIED_INTEGRATION" } });
}
const safeIntegration = (row: Integration) => ({ id: row.id, organizationId: row.organizationId, name: row.name, channel: row.channel, provider: row.provider, sender: JSON.parse(row.configuration).sender as string, status: row.status, enabled: row.enabled, version: row.version, credentialConfigured: !!row.credentialReference, createdAt: row.createdAt, updatedAt: row.updatedAt });
export function createCommunicationsService(client: PrismaClient = prisma, options: { credentials?: CredentialResolver; adapters?: readonly CommunicationAdapter[]; now?: () => Date } = {}) {
  const credentials = options.credentials ?? environmentCredentials;
  const adapterFor = (key: string) => options.adapters?.find(a => a.key === key) ?? registeredAdapter(key);
  const now = options.now ?? (() => new Date());
  const ops = createOperationsService(client);
  async function context(db: DB, userId: string, scope: { organizationId: string; projectId?: string | null }, permission: string, agent?: AgentConstraint) {
    const ctx = await createAccessContext(userId, db, agent);
    if (!ctx.user?.personId) throw new AccessError("Active human required");
    await ctx.requireAccess(permission, scope); return ctx;
  }
  async function person(db: DB, ctx: Context, personId: string, resource: { organizationId: string; projectId?: string | null }) {
    await ctx.requireAccess("person.read", resource);
    const p = await db.person.findUnique({ where: { id: personId } });
    const path = ancestry(ctx.nodes, resource.organizationId).map(n => n.id);
    if (!p || p.status !== "ACTIVE" || !await db.membership.findFirst({ where: { ...activeMembershipWhere(), personId, OR: [{ organizationId: resource.organizationId, projectId: resource.projectId ?? null }, { organizationId: { in: path }, projectId: null, scope: "DESCENDANTS" }, { organizationId: resource.organizationId, projectId: null }] } })) throw new AccessError("Recipient unavailable in this scope");
    return p;
  }
  async function saveIntegration(userId: string, raw: unknown, id?: string, expectedVersion?: number) {
    const v = input.integrationInput.parse(raw); input.addressFor(v.channel, v.configuration.sender);
    if (v.provider === "EMAIL_UNCONFIGURED" && v.channel !== "EMAIL" || v.provider === "TALKINLABS" && v.channel !== "WHATSAPP") throw new AccessError("Provider channel mismatch");
    if (v.enabled && v.provider !== "MOCK") throw new AccessError("Live provider is NOT CONFIGURED");
    return client.$transaction(async db => {
      const ctx = await context(db, userId, v, "integration.manage");
      if (!["GROUP", "COMPANY"].includes(ctx.nodes.find(n => n.id === v.organizationId)?.type ?? "")) throw new AccessError("Integration needs an actual company or group scope");
      const data = { ...v, status: v.provider === "MOCK" ? (v.enabled ? "MOCK_READY" : "DISABLED") : "NOT_CONFIGURED", configuration: JSON.stringify(v.configuration) };
      const previous = id ? await db.integration.findUnique({ where: { id } }) : null;
      if (id && (!previous || previous.organizationId !== v.organizationId || previous.provider !== v.provider || previous.channel !== v.channel)) throw new AccessError("Integration scope and provider are immutable");
      let row: Integration;
      if (previous) {
        if ((await db.integration.updateMany({ where: { id, version: expectedVersion }, data: { ...data, version: { increment: 1 } } })).count !== 1 || expectedVersion === undefined) throw new AccessError("Stale integration");
        row = await db.integration.findUniqueOrThrow({ where: { id } });
      } else row = await db.integration.create({ data: { ...data, creatorUserId: userId } });
      await communicationAudit(db, ctx, v, previous ? "integration.updated" : "integration.created", "Integration", row.id);
      if (previous?.credentialReference !== row.credentialReference) await communicationAudit(db, ctx, v, "integration.credential_reference_changed", "Integration", row.id);
      if (previous?.enabled !== row.enabled) await communicationAudit(db, ctx, v, "integration.connection_changed", "Integration", row.id);
      return safeIntegration(row);
    });
  }
  async function savePolicy(userId: string, raw: unknown) {
    const v = input.policyInput.parse(raw);
    return client.$transaction(async db => {
      const ctx = await context(db, userId, v, "communication.policy.manage"); await ctx.requireAccess("control.read", v);
      const control = await db.controlPoint.findUnique({ where: { id: v.controlPointId } });
      if (!control || control.organizationId !== v.organizationId || control.projectId !== (v.projectId ?? null) || control.status !== "ACTIVE" || control.allowSelfApproval || !["APPROVAL", "HUMAN_DECISION"].includes(control.kind)) throw new AccessError("An independent exact-scope approval control is required");
      for (const sender of v.configuration.senders) if (!v.configuration.channels.some(c => { try { input.addressFor(c, sender); return true; } catch { return false; } })) throw new AccessError("Invalid policy sender");
      const row = await db.communicationPolicy.create({ data: { ...v, configuration: JSON.stringify(v.configuration) } });
      await communicationAudit(db, ctx, v, "communication.policy_created", "CommunicationPolicy", row.id); return row;
    });
  }
  async function setConsent(userId: string, raw: unknown) {
    const v = input.consentInput.parse(raw);
    return client.$transaction(async db => {
      const ctx = await context(db, userId, v, "communication.consent.manage"), p = await person(db, ctx, v.personId, v);
      const address = input.addressFor(v.channel, v.channel === "EMAIL" ? p.email : p.phone);
      const previous = await db.communicationConsent.findUnique({ where: { organizationId_personId_channel: { organizationId: v.organizationId, personId: v.personId, channel: v.channel } } });
      if (previous && previous.version !== v.expectedVersion) throw new AccessError("Stale consent");
      const data = { organizationId: v.organizationId, personId: v.personId, channel: v.channel, address, status: v.status, source: v.source, recordedAt: now() };
      const row = previous ? await db.communicationConsent.update({ where: { id: previous.id, version: v.expectedVersion }, data: { ...data, version: { increment: 1 } } }) : await db.communicationConsent.create({ data });
      await communicationAudit(db, ctx, v, "communication.consent_recorded", "CommunicationConsent", row.id); return row;
    });
  }
  async function saveTemplate(userId: string, raw: unknown) {
    const v = input.templateInput.parse(raw);
    input.renderTemplate(v.subject ?? null, v.body, v.variables, Object.fromEntries(v.variables.map(k => [k, "validated"])));
    return client.$transaction(async db => {
      const ctx = await context(db, userId, v, "communication.template.manage");
      await person(db, ctx, ctx.user!.personId!, v);
      const row = await db.communicationTemplate.create({ data: { ...v, ownerPersonId: ctx.user!.personId!, variables: JSON.stringify(v.variables) } });
      await communicationAudit(db, ctx, v, "communication.template_created", "CommunicationTemplate", row.id); return row;
    });
  }
  async function validateMessage(db: DB, userId: string, v: input.MessageInput, agent?: AgentConstraint) {
    const ctx = await context(db, userId, v, "communication.draft", agent);
    const scope = await boundResource(db, ctx, v, "communication.read");
    const integration = await db.integration.findUnique({ where: { id: v.integrationId } });
    await ctx.requireAccess("integration.read", scope);
    const policy = await db.communicationPolicy.findUnique({ where: { id: v.policyId } });
    const consent = await db.communicationConsent.findUnique({ where: { id: v.consentId } });
    if (!integration || !policy || !consent || [integration, policy, consent].some(r => r.organizationId !== scope.organizationId) || policy.projectId !== scope.projectId || policy.status !== "ACTIVE") throw new AccessError("Communication scope mismatch");
    const configuration = input.policyConfiguration.parse(JSON.parse(policy.configuration));
    const sender = input.addressFor(integration.channel, JSON.parse(integration.configuration).sender);
    const p = await person(db, ctx, consent.personId, scope);
    const address = input.addressFor(integration.channel, integration.channel === "EMAIL" ? p.email : p.phone);
    if (consent.channel !== integration.channel || consent.status !== "OPTED_IN" || consent.address !== address) throw new AccessError("Current explicit channel consent required");
    const accounts = await boundedRead(take => db.user.findMany({ take, where: { personId: p.id, status: "ACTIVE" }, select: { id: true } }));
    for (const account of accounts) {
      const pref = await db.notificationPreference.findUnique({ where: { userId_type_channel: { userId: account.id, type: v.category, channel: integration.channel } } }) ?? await db.notificationPreference.findUnique({ where: { userId_type_channel: { userId: account.id, type: "ALL", channel: integration.channel } } });
      if (pref?.enabled === false) throw new AccessError("Recipient channel preference blocks delivery");
    }
    if (!configuration.channels.includes(integration.channel as "EMAIL" | "WHATSAPP") || !configuration.senders.includes(sender) || !configuration.categories.includes(v.category) || v.sensitivity !== "NORMAL") throw new AccessError("Communication policy blocks this message");
    if (integration.channel === "EMAIL" && !v.subject && !v.templateId) throw new AccessError("Email subject required");
    if (integration.channel === "WHATSAPP" && v.subject) throw new AccessError("WhatsApp has no email subject");
    return { ctx, scope, integration, policy, consent, configuration, sender };
  }
  async function propose(userId: string, raw: unknown, agent?: AgentConstraint) {
    const v = input.messageInput.parse(raw), hash = fingerprint({ v, agent: agent ?? null });
    return client.$transaction(async db => {
      const checked = await validateMessage(db, userId, v, agent), { ctx, scope, integration, policy, consent, sender } = checked;
      const toolKey = integration.channel === "EMAIL" ? "send_email" : "send_whatsapp";
      if (agent) {
        await ctx.requireAccess("communication.send", scope);
        const access = await inspectSiaToolAccess(agent.siaId, toolKey, scope.organizationId, db);
        if (!access.toolAllowed || !access.permissionAllowed) throw new AccessError("SIA communication tool unavailable");
      }
      const reference = "message:" + userId + ":" + v.idempotencyKey;
      const prior = await db.communicationMessage.findUnique({ where: { reference } });
      if (prior) { if (prior.fingerprint !== hash || prior.creatorPersonId !== ctx.user!.personId) throw new AccessError("Message replay mismatch"); return prior; }
      let subject = v.subject ?? null, content = v.content;
      if (v.templateId) {
        const template = await db.communicationTemplate.findUnique({ where: { id: v.templateId } });
        if (!template || template.organizationId !== scope.organizationId || template.channel !== integration.channel || template.status !== "ACTIVE") throw new AccessError("Template unavailable");
        ({ subject, content } = input.renderTemplate(template.subject, template.body, JSON.parse(template.variables), v.variables));
      } else if (Object.keys(v.variables).length) throw new AccessError("Variables require a template");
      const preview = { ...scope, integrationId: integration.id, policyId: policy.id, consentId: consent.id, channel: integration.channel, sender, recipient: consent.address, subject, content, purpose: v.purpose, category: v.category, sensitivity: v.sensitivity, templateId: v.templateId ?? null, creatorPersonId: ctx.user!.personId, siaId: agent?.siaId ?? null };
      const binding = fingerprint(preview);
      const { resourceType, resourceId, ...messageData } = preview;
      const request = await ops.createRequest(userId, { ...scope, title: ("Communication: " + v.purpose).slice(0, 200), description: "Immutable communication preview " + binding, controlPointId: policy.controlPointId, idempotencyKey: "comm:" + fingerprint(reference).slice(0, 64) }, agent ? { siaId: agent.siaId, toolKey, payload: preview } : undefined, db);
      const threadReference = "thread:" + fingerprint({ integrationId: integration.id, personId: consent.personId, ...scope });
      const thread = await db.communicationThread.upsert({ where: { reference: threadReference }, create: { organizationId: scope.organizationId, projectId: scope.projectId, resourceType, resourceId, integrationId: integration.id, channel: integration.channel, participants: JSON.stringify([consent.personId]), reference: threadReference }, update: { lastActivityAt: now() } });
      const row = await db.communicationMessage.create({ data: { ...messageData, threadId: thread.id, direction: "OUTBOUND", type: v.templateId ? "TEMPLATE" : "TEXT", requestId: request.id, creatorUserId: userId, reference, fingerprint: hash, approvalBinding: binding } });
      await communicationAudit(db, ctx, scope, agent ? "sia.communication_proposed" : "communication.message_created", "CommunicationMessage", row.id); return row;
    });
  }
  async function authorization(db: DB, userId: string, row: CommunicationMessage) {
    if (row.creatorUserId !== userId || row.direction !== "OUTBOUND" || !row.requestId || !row.policyId) throw new AccessError("Message unavailable");
    const thread = await db.communicationThread.findUniqueOrThrow({ where: { id: row.threadId } });
    const v = input.messageInput.parse({ organizationId: row.organizationId, projectId: row.projectId, resourceType: thread.resourceType, resourceId: thread.resourceId, integrationId: row.integrationId, policyId: row.policyId, consentId: row.consentId, subject: row.subject ?? undefined, content: row.content, purpose: row.purpose, category: row.category, sensitivity: row.sensitivity, idempotencyKey: "validation-only", templateId: row.templateId ?? undefined });
    const agent = row.siaId ? { siaId: row.siaId, organizationId: row.organizationId } : undefined;
    const checked = await validateMessage(db, userId, v, agent);
    await checked.ctx.requireAccess("communication.send", row);
    if (checked.ctx.user!.personId !== row.creatorPersonId || checked.sender !== row.sender || checked.consent.address !== row.recipient) throw new AccessError("Message identity or address changed");
    const request = await ops.requireApprovedRequest(userId, row.requestId, db);
    const preview = { ...checked.scope, integrationId: row.integrationId, policyId: row.policyId, consentId: row.consentId, channel: row.channel, sender: row.sender, recipient: row.recipient, subject: row.subject, content: row.content, purpose: row.purpose, category: row.category, sensitivity: row.sensitivity, templateId: row.templateId, creatorPersonId: row.creatorPersonId, siaId: row.siaId };
    if (row.approvalBinding !== fingerprint(preview) || request.description !== "Immutable communication preview " + row.approvalBinding || request.controlPointId !== checked.policy.controlPointId || request.organizationId !== row.organizationId || request.resourceId !== thread.resourceId || request.resourceType !== thread.resourceType) throw new AccessError("Approval preview binding mismatch");
    if (agent) {
      const key = row.channel === "EMAIL" ? "send_email" : "send_whatsapp";
      const boundary = await ops.siaBoundary(userId, request.id, db);
      if (request.siaId !== row.siaId || request.toolKey !== key || request.payload !== JSON.stringify(preview) || !boundary.humanApprovalValid || !boundary.toolAllowed || !boundary.permissionAllowed) throw new AccessError("SIA approval boundary denied");
    }
    const hours = checked.configuration.businessHoursUtc;
    if (hours && (now().getUTCHours() < hours.start || now().getUTCHours() >= hours.end)) throw new AccessError("Outside permitted UTC business hours");
    if (!checked.integration.enabled || checked.integration.status !== "MOCK_READY" && checked.integration.status !== "READY") throw new AccessError("Provider is NOT CONFIGURED or disabled");
    return checked;
  }
  async function confirm(userId: string, id: string, version: number, confirmed: boolean) {
    if (confirmed !== true) throw new AccessError("Explicit human confirmation required");
    return client.$transaction(async db => {
      const row = await db.communicationMessage.findUniqueOrThrow({ where: { id } }), checked = await authorization(db, userId, row);
      if (row.status === "QUEUED") return row;
      if (row.status !== "APPROVAL_REQUIRED" || row.version !== version) throw new AccessError("Stale message preview");
      if ((await db.communicationMessage.updateMany({ where: { id, version, status: "APPROVAL_REQUIRED" }, data: { status: "QUEUED", confirmedAt: now(), version: { increment: 1 } } })).count !== 1) throw new AccessError("Message already claimed");
      await communicationAudit(db, checked.ctx, row, row.siaId ? "sia.communication_approved" : "communication.message_queued", "CommunicationMessage", id);
      return db.communicationMessage.findUniqueOrThrow({ where: { id } });
    });
  }
  async function cancel(userId: string, id: string, version: number) {
    return client.$transaction(async db => {
      const row = await db.communicationMessage.findUniqueOrThrow({ where: { id } });
      const ctx = await context(db, userId, row, "communication.draft");
      const thread = await db.communicationThread.findUniqueOrThrow({ where: { id: row.threadId } }); await boundResource(db, ctx, thread, "communication.read");
      if (row.creatorUserId !== userId || !["APPROVAL_REQUIRED", "QUEUED", "FAILED"].includes(row.status) || (await db.communicationMessage.updateMany({ where: { id, version, status: row.status }, data: { status: "CANCELLED", retryable: false, version: { increment: 1 } } })).count !== 1) throw new AccessError("Message cannot be cancelled");
      await communicationAudit(db, ctx, row, "communication.message_cancelled", "CommunicationMessage", id);
    });
  }
  async function deliver(userId: string, id: string) {
    const claimed = await client.$transaction(async db => {
      const row = await db.communicationMessage.findUniqueOrThrow({ where: { id } });
      const ctx = await context(db, userId, row, "communication.process");
      const thread = await db.communicationThread.findUniqueOrThrow({ where: { id: row.threadId } });
      await boundResource(db, ctx, thread, "communication.read");
      await person(db, ctx, (await db.communicationConsent.findUniqueOrThrow({ where: { id: row.consentId } })).personId, row);
      const checked = await authorization(db, row.creatorUserId!, row);
      if (!row.confirmedAt) throw new AccessError("Human confirmation required");
      if (!["QUEUED", "FAILED"].includes(row.status) || row.status === "FAILED" && (!row.retryable || !row.nextRetryAt || row.nextRetryAt > now()) || row.attempts >= row.maxAttempts) throw new AccessError("Message not due or already processed");
      const adapter = adapterFor(checked.integration.provider);
      if (!adapter || row.attempts > 0 && !adapter.supportsIdempotency) throw new AccessError("Provider cannot safely retry");
      await rateLimit(db, row.organizationId, "send:" + row.channel + ":minute", checked.configuration.perMinute, 60000, now());
      await rateLimit(db, row.organizationId, "send:" + row.channel + ":day", checked.configuration.perDay, 86400000, now());
      if ((await db.communicationMessage.updateMany({ where: { id, status: row.status, version: row.version }, data: { status: "SENDING", attempts: { increment: 1 }, retryable: false, nextRetryAt: null, version: { increment: 1 } } })).count !== 1) throw new AccessError("Delivery already claimed");
      await communicationAudit(db, ctx, row, "communication.delivery_claimed", "CommunicationMessage", id);
      return { row, integration: checked.integration, adapter };
    });
    // External calls are outside the DB transaction. An uncertain send is NEVER blindly retried.
    let result: DeliveryResult;
    try { result = await claimed.adapter.send({ channel: claimed.row.channel, sender: claimed.row.sender, recipient: claimed.row.recipient, subject: claimed.row.subject, content: claimed.row.content, idempotencyKey: claimed.row.id, template: claimed.row.type === "TEMPLATE" }, await credentials(claimed.integration)); }
    catch { result = { status: "UNKNOWN", retryable: false, failureCode: "DELIVERY_UNCERTAIN" }; }
    if (!claimed.adapter.live && ["ACCEPTED", "SENT"].includes(result.status)) result = { status: "SIMULATED", retryable: false, externalReference: result.externalReference };
    const parsed = z.object({ status: z.enum(["ACCEPTED", "SENT", "SIMULATED", "FAILED", "REJECTED", "UNKNOWN"]), externalReference: z.string().max(200).optional(), retryable: z.boolean(), failureCode: z.enum(["PROVIDER_UNAVAILABLE", "TRANSIENT_FAILURE", "DELIVERY_UNCERTAIN", "PROVIDER_REJECTED"]).optional() }).strict().safeParse(result);
    if (!parsed.success) result = { status: "UNKNOWN", retryable: false, failureCode: "DELIVERY_UNCERTAIN" }; else result = parsed.data;
    if (["ACCEPTED", "SENT"].includes(result.status) && !result.externalReference) result = { status: "UNKNOWN", retryable: false, failureCode: "DELIVERY_UNCERTAIN" };
    return client.$transaction(async db => {
      const row = await db.communicationMessage.findUniqueOrThrow({ where: { id } });
      if (row.status !== "SENDING" || row.version !== claimed.row.version + 1) throw new AccessError("Delivery state changed; reconcile provider outcome");
      const retryable = result.status === "FAILED" && result.retryable && claimed.adapter.supportsIdempotency && row.attempts < row.maxAttempts;
      const failed = ["FAILED", "REJECTED", "UNKNOWN"].includes(result.status);
      const updated = await db.communicationMessage.update({ where: { id, version: row.version }, data: { status: result.status, simulated: !claimed.adapter.live, externalReference: result.externalReference, retryable, failureCode: result.failureCode ?? (failed ? "PROVIDER_REJECTED" : null), nextRetryAt: retryable ? new Date(now().getTime() + 60000 * 2 ** (row.attempts - 1)) : null, sentAt: result.status === "SENT" && claimed.adapter.live ? now() : null, version: { increment: 1 } } });
      // Receipt persistence retains the trusted initiating actor even if grants are revoked mid-flight.
      const actor = await db.user.findUnique({ where: { id: userId }, select: { id: true, personId: true } });
      const action = failed ? "communication.message_failed" : result.status === "SIMULATED" ? "communication.message_simulated" : (row.siaId ? "sia.communication_" : "communication.message_") + (result.status === "ACCEPTED" ? "accepted" : "sent");
      await operationalEvent(db, { actorUserId: actor?.id, actorPersonId: actor?.personId, organizationId: row.organizationId, action, entityType: "CommunicationMessage", entityId: id, result: failed ? "FAILURE" : "SUCCESS", metadata: { simulated: !claimed.adapter.live, status: result.status, attempts: row.attempts, failureCode: result.failureCode ?? null } });
      return updated;
    });
  }
  async function processDue(userId: string, limit = 25) {
    z.number().int().min(1).max(100).parse(limit);
    const ctx = await createAccessContext(userId, client), ids = ctx.organizationIds("communication.process");
    if (!ids.length) throw new AccessError("Access denied");
    const rows = await client.communicationMessage.findMany({ where: { organizationId: { in: ids }, OR: [{ status: "QUEUED" }, { status: "FAILED", retryable: true, nextRetryAt: { lte: now() } }] }, take: limit, orderBy: { createdAt: "asc" } });
    const results: { id: string; status: string }[] = [];
    for (const row of rows) { try { results.push({ id: row.id, status: (await deliver(userId, row.id)).status }); } catch (e) { if (!(e instanceof AccessError)) throw e; results.push({ id: row.id, status: "BLOCKED" }); } }
    return results;
  }
  async function ingest(integrationId: string, provider: string, body: string, signature: string, timestamp: string) {
    const integration = await client.integration.findUnique({ where: { id: integrationId } });
    if (!integration) throw new AccessError("Webhook rejected");
    const reject = async () => { await client.$transaction(db => communicationAudit(db, null, integration, "webhook.rejected", "Integration", integration.id, true)); throw new AccessError("Webhook rejected"); };
    await client.$transaction(db => rateLimit(db, integration.organizationId, "webhook:" + integration.id, JSON.parse(integration.configuration).webhookLimitPerMinute, 60000, now()));
    if (integration.provider !== provider || !integration.enabled || integration.status !== "MOCK_READY" && integration.status !== "READY") return reject();
    const adapter = adapterFor(provider);
    if (Buffer.byteLength(body, "utf8") > 16384 || !adapter || !adapter.verifyWebhook(body, signature, timestamp, await credentials(integration), now())) return reject();
    let event: ReturnType<typeof input.webhookEvent.parse>;
    try { event = adapter.normalizeWebhook(body); } catch { return reject(); }
    if (Math.abs(now().getTime() - new Date(event.occurredAt).getTime()) > 300000) return reject();
    try { return await client.$transaction(async db => {
      const current = await db.integration.findUniqueOrThrow({ where: { id: integration.id } });
      if (!current.enabled || current.version !== integration.version || current.credentialReference !== integration.credentialReference) throw new AccessError("Webhook rejected");
      const org = await db.organization.findUnique({ where: { id: current.organizationId } });
      const nodes = await boundedRead(take => db.organization.findMany({ take, select: { id: true, parentId: true, type: true, status: true } }));
      if (!org || !ancestry(nodes, org.id).length || ancestry(nodes, org.id).some(n => n.status !== "ACTIVE")) throw new AccessError("Webhook rejected");
      const hash = fingerprint(event), prior = await db.integrationEvent.findUnique({ where: { integrationId_externalEventId: { integrationId, externalEventId: event.eventId } } });
      if (prior) { if (prior.fingerprint !== hash) throw new AccessError("Webhook rejected"); return prior; }
      const receipt = await db.integrationEvent.create({ data: { organizationId: integration.organizationId, integrationId, externalEventId: event.eventId, fingerprint: hash, type: event.type, status: "PROCESSING", occurredAt: new Date(event.occurredAt) } });
      let targetId: string;
      if (event.type === "DELIVERY_STATUS") {
        const message = await db.communicationMessage.findUnique({ where: { integrationId_externalReference: { integrationId, externalReference: event.messageReference } } });
        if (!message || message.direction !== "OUTBOUND" || !["ACCEPTED", "SENT", "DELIVERED", "READ"].includes(message.status) || message.simulated || !adapter.live) throw new AccessError("Webhook rejected");
        const order = ["ACCEPTED", "SENT", "DELIVERED", "READ"];
        if (["DELIVERED", "READ"].includes(message.status) && ["FAILED", "REJECTED"].includes(event.status)) throw new AccessError("Webhook rejected");
        if (order.includes(event.status) && order.indexOf(event.status) < order.indexOf(message.status)) throw new AccessError("Webhook rejected");
        await db.communicationMessage.update({ where: { id: message.id, version: message.version }, data: { status: event.status, failureCode: event.status === "FAILED" ? "PROVIDER_FAILURE" : event.status === "REJECTED" ? "PROVIDER_REJECTED" : null, sentAt: ["SENT", "DELIVERED", "READ"].includes(event.status) ? message.sentAt ?? new Date(event.occurredAt) : message.sentAt, deliveredAt: ["DELIVERED", "READ"].includes(event.status) ? message.deliveredAt ?? new Date(event.occurredAt) : message.deliveredAt, readAt: event.status === "READ" ? new Date(event.occurredAt) : message.readAt, retryable: false, version: { increment: 1 } } }); targetId = message.id;
      } else {
        const sender = input.addressFor(integration.channel, event.sender), recipient = input.addressFor(integration.channel, event.recipient);
        if (recipient !== input.addressFor(integration.channel, JSON.parse(integration.configuration).sender)) throw new AccessError("Webhook rejected");
        const consent = await db.communicationConsent.findUnique({ where: { organizationId_channel_address: { organizationId: integration.organizationId, channel: integration.channel, address: sender } } });
        if (!consent) throw new AccessError("Webhook rejected");
        const inboundPerson = await db.person.findUnique({ where: { id: consent.personId } });
        if (!inboundPerson || inboundPerson.status !== "ACTIVE" || input.addressFor(integration.channel, integration.channel === "EMAIL" ? inboundPerson.email : inboundPerson.phone) !== sender || !await db.membership.findFirst({ where: { ...activeMembershipWhere(), personId: consent.personId, OR: [{ organizationId: integration.organizationId, projectId: null }, { organizationId: { in: ancestry(nodes, integration.organizationId).map(n => n.id) }, projectId: null, scope: "DESCENDANTS" }] } })) throw new AccessError("Webhook rejected");
        const reference = "inbound:" + integration.id + ":" + event.messageReference;
        const existing = await db.communicationMessage.findUnique({ where: { reference } });
        if (existing && (existing.content !== event.content || existing.sender !== sender || existing.recipient !== recipient)) throw new AccessError("Webhook rejected");
        const threadReference = "thread:" + fingerprint({ integrationId, personId: consent.personId, organizationId: integration.organizationId, projectId: null, resourceType: "ORGANIZATION", resourceId: integration.organizationId });
        const thread = await db.communicationThread.upsert({ where: { reference: threadReference }, create: { organizationId: integration.organizationId, resourceType: "ORGANIZATION", resourceId: integration.organizationId, integrationId, channel: integration.channel, participants: JSON.stringify([consent.personId]), reference: threadReference }, update: { lastActivityAt: now() } });
        const message = existing ?? await db.communicationMessage.create({ data: { organizationId: integration.organizationId, threadId: thread.id, integrationId, consentId: consent.id, channel: integration.channel, direction: "INBOUND", sender, recipient, subject: event.subject, content: event.content, purpose: "Verified inbound communication", category: "OPERATIONAL", status: adapter.live ? "RECEIVED" : "SIMULATED", simulated: !adapter.live, externalReference: event.messageReference, reference, fingerprint: hash } }); targetId = message.id;
      }
      const audit = await communicationAudit(db, null, integration, "integration.event_received", "CommunicationMessage", targetId);
      return db.integrationEvent.update({ where: { id: receipt.id }, data: { status: "SUCCEEDED", operationalEventId: audit.id } });
    }); } catch {
      await client.$transaction(async db => {
        const prior = await db.integrationEvent.findUnique({ where: { integrationId_externalEventId: { integrationId, externalEventId: event.eventId } } });
        if (!prior) await db.integrationEvent.create({ data: { organizationId: integration.organizationId, integrationId, externalEventId: event.eventId, type: event.type, fingerprint: fingerprint(event), status: "FAILED", failureCode: "PROCESSING_REJECTED", occurredAt: new Date(event.occurredAt) } });
        await communicationAudit(db, null, integration, "webhook.rejected", "Integration", integration.id, true);
      });
      throw new AccessError("Webhook rejected");
    }
  }
  async function workspace(userId: string, organizationId?: string, filter: { status?: string; channel?: string; search?: string; threadId?: string; view?: string; cursor?: string } = {}, agent?: AgentConstraint) {
    const ctx = await createAccessContext(userId, client, agent);
    if (!ctx.active) throw new AccessError("Access denied");
    if (organizationId) await ctx.requireAccess("communication.read", { organizationId });
    const ids = organizationId ? [organizationId] : ctx.organizationIds("communication.read");
    const scope = { organizationId: { in: ids } };
    const organizations = await boundedRead(take => client.organization.findMany({ take, where: { id: { in: ctx.organizationIds("communication.read").filter(id => ctx.organizationIds("organization.read").includes(id)) } }, select: { id: true, name: true, type: true } }));
    const integrations = (await boundedRead(take => client.integration.findMany({ take, where: { organizationId: { in: ids.filter(id => ctx.organizationIds("integration.read").includes(id)) } }, orderBy: { name: "asc" } }))).map(safeIntegration);
    const messages: CommunicationMessage[] = [], threads: import("@prisma/client").CommunicationThread[] = [];
    for (const thread of await boundedRead(take => client.communicationThread.findMany({ take, where: { ...scope, ...(filter.channel ? { channel: filter.channel } : {}), ...(filter.threadId ? { id: filter.threadId } : {}) }, orderBy: { lastActivityAt: "desc" } }))) {
      try { await boundResource(client, ctx, thread, "communication.read");
        const participants = z.array(z.string()).parse(JSON.parse(thread.participants)); for (const id of participants) await person(client, ctx, id, thread);
        threads.push(thread);
      } catch (e) { if (!(e instanceof AccessError)) throw e; }
    }
    const allMessages = await boundedRead(take => client.communicationMessage.findMany({ take, where: { ...scope, threadId: { in: threads.map(t => t.id) }, ...(filter.status ? { status: filter.status } : {}), ...(filter.search ? { OR: [{ subject: { contains: filter.search } }, { purpose: { contains: filter.search } }] } : {}) }, include: { request: { select: { status: true } } }, orderBy: { createdAt: "desc" } }));
    const requestStatuses: Record<string, string> = {};
    for (const row of allMessages) { const { request, ...message } = row; messages.push(message); requestStatuses[row.id] = request?.status ?? "NOT_REQUIRED"; }
    const templates = await boundedRead(take => client.communicationTemplate.findMany({ take, where: scope, orderBy: [{ key: "asc" }, { version: "desc" }] }));
    const policies = await boundedRead(take => client.communicationPolicy.findMany({ take, where: scope, orderBy: { name: "asc" } }));
    const consents = [];
    for (const consent of await boundedRead(take => client.communicationConsent.findMany({ take, where: scope }))) { try { const p = await person(client, ctx, consent.personId, consent); consents.push({ ...consent, personName: p.displayName }); } catch (e) { if (!(e instanceof AccessError)) throw e; } }
    const controls = await boundedRead(take => client.controlPoint.findMany({ take, where: { organizationId: { in: ids.filter(id => ctx.organizationIds("control.read").includes(id)) }, projectId: null, status: "ACTIVE", allowSelfApproval: false, kind: { in: ["APPROVAL", "HUMAN_DECISION"] } }, select: { id: true, organizationId: true, name: true } }));
    const people: { id: string; displayName: string }[] = [];
    for (const membership of await boundedRead(take => client.membership.findMany({ take, where: { organizationId: { in: ids }, ...activeMembershipWhere() }, include: { person: { select: { id: true, displayName: true } } } }))) if ((await ctx.decide("person.read", membership)).allowed && !people.some(p => p.id === membership.personId)) people.push(membership.person);
    const events = await boundedRead(take => client.integrationEvent.findMany({ take, where: { integrationId: { in: integrations.map(i => i.id) } }, orderBy: { receivedAt: "desc" } }));
    const ruleIds = ids.filter(id => ctx.organizationIds("automation.read").includes(id));
    const rules = await boundedRead(take => client.automationRule.findMany({ take, where: { organizationId: { in: ruleIds } }, orderBy: { name: "asc" } }));
    const jobs = await boundedRead(take => client.scheduledJob.findMany({ take, where: { organizationId: { in: ruleIds } }, orderBy: { nextRunAt: "asc" } }));
    const pageKey = ({ messages: "messages", delivery: "messages", threads: "threads", integrations: "integrations", templates: "templates", policies: "policies", consent: "consents", automation: "rules", jobs: "jobs", webhooks: "events" } as Record<string, string>)[filter.view ?? ""];
    let nextCursor: string | null = null;
    const paged = <T extends { id: string }>(key: string, rows: T[]) => {
      if (pageKey !== key) return rows;
      const page = resultPage(rows, { after: filter.cursor });
      nextCursor = page.nextCursor;
      return page.records;
    };
    const can = (key: string) => ids.filter(id => ctx.organizationIds(key).includes(id));
    return { organizations, integrations: paged("integrations", integrations), messages: paged("messages", filter.view === "delivery" ? messages.filter(m => m.direction === "OUTBOUND") : messages), requestStatuses, threads: paged("threads", threads), templates: paged("templates", templates), policies: paged("policies", policies), consents: paged("consents", consents), controls, people, events: paged("events", events), rules: paged("rules", rules), jobs: paged("jobs", jobs), nextCursor, capabilities: Object.fromEntries(["integration.manage", "communication.draft", "communication.send", "communication.process", "communication.policy.manage", "communication.consent.manage", "communication.template.manage", "automation.manage", "automation.process"].map(k => [k, can(k)])), overview: { failedMessages: messages.filter(m => ["FAILED", "REJECTED", "UNKNOWN"].includes(m.status)).length, pendingMessages: messages.filter(m => ["QUEUED", "SENDING", "APPROVAL_REQUIRED"].includes(m.status)).length, importantThreads: threads.filter(t => t.priority === "HIGH" && t.status === "OPEN").length, automationFailures: jobs.filter(j => j.status === "FAILED").length, integrationsNotConfigured: integrations.filter(i => i.status === "NOT_CONFIGURED").length }, currentUserId: userId };
  }
  async function archive(userId: string, kind: "policy" | "template", id: string) {
    return client.$transaction(async db => {
      const row = kind === "policy" ? await db.communicationPolicy.findUniqueOrThrow({ where: { id } }) : await db.communicationTemplate.findUniqueOrThrow({ where: { id } });
      const ctx = await context(db, userId, row, kind === "policy" ? "communication.policy.manage" : "communication.template.manage");
      if (row.status !== "ACTIVE") throw new AccessError("Already archived");
      if (kind === "policy") await db.communicationPolicy.update({ where: { id, status: "ACTIVE" }, data: { status: "ARCHIVED" } });
      else await db.communicationTemplate.update({ where: { id, status: "ACTIVE" }, data: { status: "ARCHIVED" } });
      await communicationAudit(db, ctx, row, "communication." + kind + "_archived", kind === "policy" ? "CommunicationPolicy" : "CommunicationTemplate", id);
    });
  }
  async function updateThread(userId: string, id: string, status: "OPEN" | "CLOSED", priority: "NORMAL" | "HIGH") {
    z.enum(["OPEN", "CLOSED"]).parse(status); z.enum(["NORMAL", "HIGH"]).parse(priority);
    return client.$transaction(async db => {
      const row = await db.communicationThread.findUniqueOrThrow({ where: { id } }), ctx = await context(db, userId, row, "communication.draft");
      await boundResource(db, ctx, row, "communication.read");
      await db.communicationThread.update({ where: { id }, data: { status, priority } });
      await communicationAudit(db, ctx, row, "communication.thread_changed", "CommunicationThread", id);
    });
  }
  return { archive, updateThread, saveIntegration, savePolicy, setConsent, saveTemplate, propose, confirm, cancel, deliver, processDue, ingest, workspace };
}
export const communicationsService = createCommunicationsService();
