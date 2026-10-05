import assert from "node:assert/strict";
import { SignJWT } from "jose";
import { PrismaClient } from "@prisma/client";
import { config } from "../src/server/config";
import { createCommunicationsService } from "../src/server/communications/service";
import { createAutomationService } from "../src/server/communications/automation";
import { createOperationsService } from "../src/server/domain/operations-service";
import { createExecutionService } from "../src/server/domain/execution-service";

async function main() {
  const target = new URL(process.env.MAXPASE_SMOKE_URL ?? "http://127.0.0.1:3000");
  assert(["localhost", "127.0.0.1", "[::1]"].includes(target.hostname));
  const db = new PrismaClient(), comm = createCommunicationsService(db), ops = createOperationsService(db), automation = createAutomationService(db);
  let organizationId: string | undefined, sessionId: string | undefined, personId: string | undefined, accountId: string | undefined, roleId: string | undefined;
  try {
    const admin = await db.user.findUniqueOrThrow({ where: { email: "admin@maxpase.local" } });
    const group = await db.organization.findUniqueOrThrow({ where: { slug: "maxpase-group" } });
    const scope = await db.organization.create({ data: { name: "Communication HTTP fixture (temporary)", slug: "communication-smoke-" + crypto.randomUUID(), type: "COMPANY", parentId: group.id } }); organizationId = scope.id;
    const person = await db.person.create({ data: { displayName: "Communication reviewer (temporary)", email: "communication-smoke-" + crypto.randomUUID() + "@test.invalid" } }); personId = person.id;
    const account = await db.user.create({ data: { email: "communication-account-" + crypto.randomUUID() + "@test.invalid", personId: person.id } }); accountId = account.id;
    const keys = ["organization.read", "person.read", "approval.read", "approval.decide", "notification.read", "communication.read", "project.read", "task.read", "request.read", "reminder.read", "sia.approve_action"];
    const role = await db.role.create({ data: { organizationId: scope.id, name: "Temporary communication reviewer", key: "communication-smoke-" + crypto.randomUUID(), permissions: { create: keys.map(key => ({ permission: { connect: { key } } })) } } }); roleId = role.id;
    await db.membership.create({ data: { organizationId: scope.id, personId: person.id, roles: { create: { roleId: role.id } } } });
    const expiresAt = new Date(Date.now() + 600000);
    const session = await db.session.create({ data: { userId: admin.id, expiresAt } }); sessionId = session.id;
    const token = await new SignJWT({ sessionId: session.id }).setProtectedHeader({ alg: "HS256" }).setSubject(admin.id).setIssuer("maxpase-os").setAudience("maxpase-os-web").setExpirationTime(Math.floor(expiresAt.getTime() / 1000)).sign(new TextEncoder().encode(config.AUTH_SECRET));
    const cookie = config.AUTH_COOKIE_NAME + "=" + token;
    const integration = await comm.saveIntegration(admin.id, { organizationId: scope.id, name: "Temporary mock email", channel: "EMAIL", provider: "MOCK", enabled: true, configuration: { sender: "operations@test.invalid" } });
    const control = await ops.saveControl(admin.id, { organizationId: scope.id, name: "Temporary independent review", kind: "APPROVAL", requiredPermission: "approval.decide", stages: [[{ approverUserId: account.id }]] });
    const policy = await comm.savePolicy(admin.id, { organizationId: scope.id, name: "Temporary communication policy", controlPointId: control.id, configuration: { channels: ["EMAIL"], senders: ["operations@test.invalid"], categories: ["OPERATIONAL"] } });
    const consent = await comm.setConsent(admin.id, { organizationId: scope.id, personId: person.id, channel: "EMAIL", status: "OPTED_IN", source: "Temporary smoke fixture consent, not business consent" });
    const template = await comm.saveTemplate(admin.id, { organizationId: scope.id, key: "SMOKE_NOTICE", version: 1, name: "Temporary email template", purpose: "HTTP fixture", channel: "EMAIL", subject: "Temporary communication review", body: "Hello {{name}}", variables: ["name"] });
    const message = await comm.propose(admin.id, { organizationId: scope.id, resourceType: "ORGANIZATION", resourceId: scope.id, integrationId: integration.id, policyId: policy.id, consentId: consent.id, templateId: template.id, variables: { name: "Reviewer" }, content: "Template", purpose: "Temporary controlled preview", category: "OPERATIONAL", idempotencyKey: crypto.randomUUID() });
    await ops.submitRequest(admin.id, message.requestId!);
    const approval = await db.siaApproval.findFirstOrThrow({ where: { requestId: message.requestId } });
    await ops.decide(account.id, { approvalId: approval.id, decision: "APPROVED", comment: "Temporary fixture independently reviewed" });
    await comm.confirm(admin.id, message.id, message.version, true);
    assert.equal((await comm.deliver(admin.id, message.id)).status, "SIMULATED");
    await createExecutionService(db).save(admin.id, "tasks", { organizationId: scope.id, title: "Temporary overdue task", dueDate: "2000-01-01", assigneePersonId: person.id });
    const rule = await automation.saveRule(admin.id, { organizationId: scope.id, name: "Temporary operational rule", enabled: true, trigger: "TASK_OVERDUE", action: "NOTIFY_OWNER", condition: { recipientUserId: account.id } });
    await automation.schedule(admin.id, { ruleId: rule.id, nextRunAt: "2000-01-01", intervalMinutes: 60, maxRuns: 1 }); await automation.processDue(admin.id);
    const checks = [["overview", "Temporary mock email"], ["integrations", "MOCK_READY"], ["messages", "Hello Reviewer"], ["threads", "OPEN"], ["templates", template.name], ["policies", policy.name], ["consent", consent.source], ["automation", rule.name], ["jobs", "SUCCEEDED"], ["webhooks", "No verified webhook events."], ["delivery", "SIMULATED"]];
    for (const [view, expected] of checks) {
      const response = await fetch(new URL("/app/communications?" + new URLSearchParams({ view, organizationId: scope.id }), target), { headers: { cookie } });
      const html = await response.text(); assert.equal(response.status, 200); assert(html.includes(expected) && !html.includes("Communication unavailable") && !html.includes("NEXT_ERROR"), "Missing real fixture in " + view);
      console.log("PASS real communication fixture: " + view);
    }
    const approvalPage = await fetch(new URL("/app/operations/approvals?organizationId=" + scope.id + "&approverUserId=" + account.id, target), { headers: { cookie } });
    const approvalHtml = await approvalPage.text(); assert.equal(approvalPage.status, 200); assert(approvalHtml.includes("Communication Preview") && approvalHtml.includes("Hello Reviewer"));
    const rejected = await fetch(new URL("/api/integrations/" + integration.id + "/webhook", target), { method: "POST", headers: { "content-type": "application/json", "x-maxpase-provider": "MOCK", "x-maxpase-timestamp": String(Math.floor(Date.now() / 1000)), "x-maxpase-signature": "a".repeat(64) }, body: "{}" });
    assert.equal(rejected.status, 400); assert.deepEqual(await rejected.json(), { error: "Webhook rejected" });
    console.log("PASS exact approval preview and safe spoofed-webhook rejection");
  } finally {
    if (organizationId) await db.$transaction(async tx => {
      // Cleanup is limited to the one exact, newly created temporary scope.
      const scope = { organizationId };
      await tx.integrationEvent.deleteMany({ where: scope });
      await tx.communicationMessage.deleteMany({ where: scope });
      await tx.communicationThread.deleteMany({ where: scope });
      await tx.communicationPolicy.deleteMany({ where: scope });
      await tx.communicationTemplate.deleteMany({ where: scope });
      await tx.communicationConsent.deleteMany({ where: scope });
      await tx.communicationRateBucket.deleteMany({ where: scope });
      await tx.integration.deleteMany({ where: scope });
      const rules = await tx.automationRule.findMany({ where: scope, select: { id: true } });
      await tx.automationRun.deleteMany({ where: { ruleId: { in: rules.map(r => r.id) } } });
      await tx.scheduledJob.deleteMany({ where: scope }); await tx.automationRule.deleteMany({ where: scope });
      await tx.notification.deleteMany({ where: scope }); await tx.reminder.deleteMany({ where: scope });
      await tx.siaApproval.deleteMany({ where: { request: scope } }); await tx.operationalRequest.deleteMany({ where: scope });
      await tx.approvalRule.deleteMany({ where: { controlPoint: scope } }); await tx.controlPoint.deleteMany({ where: scope });
      await tx.task.deleteMany({ where: scope });
      const memberships = await tx.membership.findMany({ where: scope, select: { id: true } });
      await tx.membershipRole.deleteMany({ where: { membershipId: { in: memberships.map(m => m.id) } } }); await tx.membership.deleteMany({ where: scope });
      if (roleId) { await tx.rolePermission.deleteMany({ where: { roleId } }); await tx.role.delete({ where: { id: roleId } }); }
      await tx.operationalEvent.deleteMany({ where: scope }); await tx.auditEvent.deleteMany({ where: scope });
      if (accountId) await tx.user.delete({ where: { id: accountId } });
      if (personId) await tx.person.delete({ where: { id: personId } });
      await tx.organization.delete({ where: { id: organizationId } });
    }, { timeout: 30000 });
    if (sessionId) await db.session.deleteMany({ where: { id: sessionId } });
    await db.$disconnect();
    console.log("PASS exact communication-fixture cleanup");
  }
}
main().catch(() => { console.error("Communication HTTP smoke failed; check the controlled fixture assertions."); process.exitCode = 1; });
