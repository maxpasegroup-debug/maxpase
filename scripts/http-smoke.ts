import assert from "node:assert/strict";
import { SignJWT } from "jose";
import { PrismaClient } from "@prisma/client";
import { config } from "../src/server/config";
import { businessKinds } from "../src/server/domain/business-input";
import { workforceKinds } from "../src/server/domain/workforce-input";
import { executionKinds } from "../src/server/domain/execution-input";
import { createExecutionService } from "../src/server/domain/execution-service";
import { operationsKinds } from "../src/server/domain/operations-input";
import { createOperationsService } from "../src/server/domain/operations-service";
import { createAiraService } from "../src/server/domain/aira-service";
import { companyKinds } from "../src/server/domain/company-input";
import { createExecutiveService } from "../src/server/domain/executive-service";
import { createSiaService } from "../src/server/sia/service";
import { createWorkforceService } from "../src/server/domain/workforce-service";

async function main() {
  const target = new URL(process.env.MAXPASE_SMOKE_URL ?? "http://127.0.0.1:3000");
  assert(["localhost", "127.0.0.1", "[::1]"].includes(target.hostname), "Smoke test only targets a local server");
  const db = new PrismaClient();
  let sessionId: string | undefined;
  let fixtureProjectId: string | undefined;
  let fixtureTaskId: string | undefined;
  let fixtureControlId: string | undefined;
  let fixtureDefinitionId: string | undefined;
  let fixtureInstanceId: string | undefined;
  let fixtureRequestId: string | undefined;
  let fixtureApprovalIds: string[] = [];
  let fixtureProgramId: string | undefined;
  let fixtureBatchId: string | undefined;
  let fixtureLocationId: string | undefined;
  const fixtureExecutiveIds: string[] = [];
  let fixtureSiaId: string | undefined;
  let fixtureAgentRoleId: string | undefined;
  const fixtureSiaEntities: string[] = [];
  try {
    const denied = await fetch(new URL("/app/business/companies", target), { redirect: "manual" });
    assert([303, 307].includes(denied.status));
    assert(denied.headers.get("location")?.includes("/login"));
    const admin = await db.user.findUniqueOrThrow({ where: { email: "admin@maxpase.local" } });
    const expiresAt = new Date(Date.now() + 300000);
    const session = await db.session.create({ data: { userId: admin.id, expiresAt } });
    sessionId = session.id;
    const token = await new SignJWT({ sessionId: session.id }).setProtectedHeader({ alg: "HS256" }).setSubject(admin.id).setIssuer("maxpase-os").setAudience("maxpase-os-web").setExpirationTime(Math.floor(expiresAt.getTime()/1000)).sign(new TextEncoder().encode(config.AUTH_SECRET));
    for (const kind of businessKinds) {
      const response = await fetch(new URL("/app/business/" + kind, target), { headers: { cookie: config.AUTH_COOKIE_NAME + "=" + token } });
      const html = await response.text();
      assert.equal(response.status, 200, kind);
      assert(!html.includes("Records unavailable"), kind + " rendered its error boundary");
      if (["projects", "goals"].includes(kind)) assert(html.includes("NEXT_REDIRECT") && html.includes("/app/execution/" + kind) || html.includes("Execution workspace"), kind + " is missing its execution redirect");
      else assert(html.includes("Business universe"), kind + " is missing its registry");
      if (kind === "companies") assert(html.includes("AIRA Skill City"), "Known seeded company not shown");
      console.log("PASS /app/business/" + kind);
    }
    for (const kind of workforceKinds) {
      const response = await fetch(new URL("/app/workforce/" + kind, target), { headers: { cookie: config.AUTH_COOKIE_NAME + "=" + token } });
      const html = await response.text();
      assert.equal(response.status, 200, kind);
      assert(!html.includes("This view is unavailable"), kind + " rendered its error boundary");
      assert(html.includes("People &amp; access"), kind + " is missing its management view");
      if (kind === "roles") assert(html.includes("Chief Executive Officer") && html.includes("SIA"), "Canonical designations are missing");
      console.log("PASS /app/workforce/" + kind);
    }
    for (const path of ["/app/execution", ...executionKinds.map(k => "/app/execution/" + k)]) {
      const response = await fetch(new URL(path, target), { headers: { cookie: config.AUTH_COOKIE_NAME + "=" + token } });
      const html = await response.text();
      assert.equal(response.status, 200, path);
      assert(html.includes("Execution workspace") && !html.includes("Execution unavailable"), path + " failed to render");
      console.log("PASS " + path);
    }
    for (const path of ["/app/operations", ...operationsKinds.map(k => "/app/operations/" + k)]) {
      const response = await fetch(new URL(path, target), { headers: { cookie: config.AUTH_COOKIE_NAME + "=" + token } });
      const html = await response.text();
      assert.equal(response.status, 200, path);
      assert(!html.includes("Operation unavailable") && !html.includes("NEXT_ERROR"), path + " failed to render");
      assert(html.includes("Operations"), path + " missing operational shell");
      console.log("PASS " + path);
    }
    for (const path of ["/app/aira", ...companyKinds.map(k => "/app/aira/" + k)]) {
      const response = await fetch(new URL(path, target), { headers: { cookie: config.AUTH_COOKIE_NAME + "=" + token } });
      const html = await response.text();
      assert.equal(response.status, 200, path);
      assert(html.includes("AIRA Skill City") && !html.includes("Company View Unavailable") && !html.includes("NEXT_ERROR"), path + " failed to render");
      console.log("PASS " + path);
    }
    for (const path of ["/app/executive", ...["briefing", "attention", "decisions", "companies", "projects", "goals", "operations", "kpis", "risks", "opportunities", "changes", "metrics"].map(v => "/app/executive/" + v)]) {
      const response = await fetch(new URL(path, target), { headers: { cookie: config.AUTH_COOKIE_NAME + "=" + token } });
      const html = await response.text(); assert.equal(response.status, 200, path);
      assert(html.includes("Executive Command Center") && !html.includes("Executive view unavailable") && !html.includes("NEXT_ERROR"), path + " failed to render");
      console.log("PASS " + path);
    }
    for (const view of ["conversation", "briefing", "attention", "decisions", "actions", "memory", "tools", "context", "activity"]) {
      const response = await fetch(new URL("/app/sia?view=" + view, target), { headers: { cookie: config.AUTH_COOKIE_NAME + "=" + token } });
      const html = await response.text(); assert.equal(response.status, 200);
      assert(html.includes("MAXPASE GROUP VIRTUAL CEO") && html.includes("High-impact autonomous execution is disabled") && !html.includes("NEXT_ERROR"), "SIA view failed: " + view);
      console.log("PASS /app/sia?view=" + view);
    }
    for (const view of ["overview", "integrations", "messages", "threads", "templates", "policies", "consent", "automation", "jobs", "webhooks", "delivery"]) {
      const response = await fetch(new URL("/app/communications?view=" + view, target), { headers: { cookie: config.AUTH_COOKIE_NAME + "=" + token } });
      const html = await response.text(); assert.equal(response.status, 200);
      assert(html.includes("Communication Overview") && !html.includes("Communication unavailable") && !html.includes("NEXT_ERROR"), "Communication view failed: " + view);
      console.log("PASS /app/communications?view=" + view);
    }
    const rejectedWebhook = await fetch(new URL("/api/integrations/unknown/webhook", target), { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    assert.equal(rejectedWebhook.status, 400); assert.deepEqual(await rejectedWebhook.json(), { error: "Webhook rejected" });
    console.log("PASS public webhook rejection does not disclose internal errors");
    if (process.env.MAXPASE_SMOKE_FIXTURE === "true") {
      // Opt-in local test records, not seed data; clean only the exact IDs created here.
      const organization = await db.organization.findUniqueOrThrow({ where: { slug: "aira-skill-city" } });
      const aira = createAiraService(db);
      const division = await db.organization.findUniqueOrThrow({ where: { slug: "aira-startup-school" } });
      const program = await aira.save(admin.id, "programs", { organizationId: division.id, name: "HTTP smoke program (temporary)", slug: "http-smoke-" + crypto.randomUUID() }); fixtureProgramId = program.id;
      const location = await aira.save(admin.id, "locations", { organizationId: organization.id, name: "HTTP smoke location (temporary)" }); fixtureLocationId = location.id;
      const batch = await aira.save(admin.id, "batches", { programId: program.id, locationId: location.id, name: "HTTP smoke batch (temporary)" }); fixtureBatchId = batch.id;
      for (const [kind, text] of [["programs", "HTTP smoke program (temporary)"], ["batches", "HTTP smoke batch (temporary)"], ["locations", "HTTP smoke location (temporary)"]] as const) {
        const response = await fetch(new URL("/app/aira/" + kind, target), { headers: { cookie: config.AUTH_COOKIE_NAME + "=" + token } });
        const html = await response.text();
        assert.equal(response.status, 200);
        assert(html.includes(text) && !html.includes("Company View Unavailable"), "AIRA real " + kind + " did not render");
      }
      console.log("PASS real AIRA program, batch and location rendering");
      const service = createExecutionService(db);
      const project = await service.save(admin.id, "projects", { organizationId: organization.id, name: "HTTP smoke fixture (temporary)", slug: "http-smoke-" + crypto.randomUUID(), status: "PLANNED", ownerPersonId: admin.personId });
      fixtureProjectId = project.id;
      const task = await service.save(admin.id, "tasks", { organizationId: organization.id, projectId: project.id, title: "HTTP smoke next action (temporary)", assigneePersonId: admin.personId });
      fixtureTaskId = task.id;
      const response = await fetch(new URL("/app/execution/projects/" + project.id, target), { headers: { cookie: config.AUTH_COOKIE_NAME + "=" + token } });
      const html = await response.text();
      assert.equal(response.status, 200);
      assert(html.includes("HTTP smoke fixture (temporary)") && html.includes("HTTP smoke next action (temporary)") && !html.includes("Execution unavailable"), "Project detail did not render actual related work");
      console.log("PASS temporary project detail and actual next-action rendering");
      const ops = createOperationsService(db);
      const control = await ops.saveControl(admin.id, { organizationId: organization.id, projectId: project.id, name: "HTTP smoke control (temporary)", kind: "APPROVAL", requiredPermission: "approval.decide", allowSelfApproval: true, stages: [[{ approverUserId: admin.id }]] });
      fixtureControlId = control.id;
      const definition = await ops.saveWorkflow(admin.id, { organizationId: organization.id, projectId: project.id, name: "HTTP smoke workflow (temporary)", key: "SMOKE_PROCESS", version: 1, states: [{ key: "OPEN", name: "Open", initial: true }, { key: "CLOSED", name: "Closed", terminal: true }], transitions: [{ key: "CLOSE", from: "OPEN", to: "CLOSED", requiredPermission: "workflow.transition", controlPointId: control.id }] });
      fixtureDefinitionId = definition.id;
      await ops.publishWorkflow(admin.id, definition.id);
      const resource = { organizationId: organization.id, projectId: project.id, resourceType: "PROJECT", resourceId: project.id };
      const instance = await ops.startWorkflow(admin.id, { ...resource, definitionId: definition.id, title: "HTTP smoke workflow run (temporary)", idempotencyKey: crypto.randomUUID() });
      fixtureInstanceId = instance.id;
      const request = await ops.createRequest(admin.id, { ...resource, controlPointId: control.id, workflowInstanceId: instance.id, title: "HTTP smoke approval (temporary)", idempotencyKey: crypto.randomUUID() });
      fixtureRequestId = request.id;
      await ops.submitRequest(admin.id, request.id);
      fixtureApprovalIds = (await db.siaApproval.findMany({ where: { requestId: request.id }, select: { id: true } })).map(a => a.id);
      for (const [route, text] of [["approvals", request.title], ["requests", request.title], ["workflows", definition.name], ["instances", instance.title], ["notifications", "Approval required"], ["activity", "approval requested"], ["events", "approval.requested"], ["controls", control.name]] as const) {
        const rendered = await fetch(new URL("/app/operations/" + route, target), { headers: { cookie: config.AUTH_COOKIE_NAME + "=" + token } });
        const body = await rendered.text();
        assert.equal(rendered.status, 200, route);
        assert(body.includes(text) && !body.includes("Operation unavailable"), route + " missing real fixture data");
      }
      console.log("PASS real approval, request, workflow/run, notification, activity, event and control rendering");
      const executive = createExecutiveService(db);
      for (const [kind, title, extra] of [["RISK", "HTTP smoke risk (temporary)", { severity: "HIGH" }], ["DECISION", "HTTP smoke decision (temporary)", { impact: "Human review only" }], ["KPI", "HTTP smoke KPI (temporary)", { target: 10, unit: "reports", direction: "HIGHER", periodStart: "2020-01-01", periodEnd: "2030-12-31", source: "Temporary signed test report" }], ["OPPORTUNITY", "HTTP smoke opportunity (temporary)", { impact: "Delivery opportunity", nextAction: "Validate demand" }]] as const) {
        const row = await executive.save(admin.id, { kind, title, organizationId: organization.id, projectId: project.id, ownerPersonId: admin.personId, description: "Local verification fixture", reference: crypto.randomUUID(), ...extra });
        fixtureExecutiveIds.push(row.id);
        const route = ({ RISK: "risks", DECISION: "decisions", KPI: "kpis", OPPORTUNITY: "opportunities" } as const)[kind];
        const rendered = await fetch(new URL("/app/executive/" + route, target), { headers: { cookie: config.AUTH_COOKIE_NAME + "=" + token } });
        const body = await rendered.text(); assert.equal(rendered.status, 200); assert(body.includes(title) && !body.includes("Executive view unavailable"), "Real executive record missing");
      }
      const executiveResponse = await fetch(new URL("/app/executive", target), { headers: { cookie: config.AUTH_COOKIE_NAME + "=" + token } });
      const executiveBody = await executiveResponse.text(); assert(executiveBody.includes(request.title), "Shared approval not shown in executive decision queue");
      console.log("PASS real executive decision, KPI, risk, opportunity and shared approval rendering");
      const sia = createSiaService(db), workforce = createWorkforceService(db);
      const identity = await db.siaIdentity.create({ data: { name: "HTTP smoke SIA (temporary)" } }); fixtureSiaId = identity.id;
      const role = await workforce.save(admin.id, "roles", { organizationId: organization.id, key: "smoke-agent-" + crypto.randomUUID(), name: "HTTP smoke agent role (temporary)", principalType: "AGENT" }); fixtureAgentRoleId = role.id;
      for (const key of ["executive.read", "organization.read", "company.read", "project.read", "task.read", "decision.read", "risk.read", "kpi.read", "opportunity.read", "approval.read", "request.read", "workflow.read", "event.read", "notification.read", "person.read", "membership.read", "milestone.read", "blocker.read", "dependency.read"]) {
        const permission = await db.permission.findUniqueOrThrow({ where: { key } });
        await workforce.setPermission(admin.id, role.id, permission.id, true);
      }
      await workforce.setSiaRole(admin.id, identity.id, organization.id, role.id, true);
      const selection = { siaId: identity.id, organizationId: organization.id };
      for (const key of ["prepare_report", "get_attention_items", "get_pending_decisions"]) await sia.setTool(admin.id, selection, key, true);
      const memory = await sia.saveMemory(admin.id, { ...selection, category: "KNOWLEDGE", key: "http-smoke-context", value: "HTTP smoke reviewed knowledge (temporary)", sourceType: "HUMAN_ATTESTATION" }); fixtureSiaEntities.push(memory.id);
      await sia.reviewMemory(admin.id, memory.id, 0, "APPROVED");
      await sia.converse(admin.id, { ...selection, message: "Prepare a report", idempotencyKey: crypto.randomUUID() });
      for (const [view, expected] of [["briefing", "HTTP smoke fixture (temporary)"], ["decisions", request.title], ["memory", memory.value], ["tools", "prepare report"], ["activity", "prepare report"]]) {
        const response = await fetch(new URL("/app/sia?" + new URLSearchParams({ siaId: identity.id, scope: organization.id, view }), target), { headers: { cookie: config.AUTH_COOKIE_NAME + "=" + token } });
        const html = await response.text(); assert.equal(response.status, 200); assert(html.includes(expected) && !html.includes("Current evidence is unavailable"), "SIA real evidence missing: " + view);
      }
      console.log("PASS real SIA briefing, decisions, reviewed memory, controlled tools and activity rendering");
    }
    const invalid = await fetch(new URL("/app/business/unknown", target), { headers: { cookie: config.AUTH_COOKIE_NAME + "=" + token } });
    const invalidHtml = await invalid.text();
    assert([200, 404].includes(invalid.status));
    assert(invalidHtml.includes("NEXT_HTTP_ERROR_FALLBACK;404") || invalidHtml.includes("This page could not be found"), "Unknown route is missing its not-found state");
    console.log("PASS unauthenticated redirect, authenticated registries and unknown-route not-found state");
  } finally {
    if (fixtureSiaId) {
      const runs = await db.siaRun.findMany({ where: { siaId: fixtureSiaId }, select: { id: true } }); fixtureSiaEntities.push(...runs.map(r => r.id));
      const tools = await db.siaTool.findMany({ where: { siaId: fixtureSiaId }, select: { id: true } }); fixtureSiaEntities.push(...tools.map(t => t.id));
      if (fixtureAgentRoleId) fixtureSiaEntities.push(fixtureAgentRoleId);
      const assignments = await db.siaRoleAssignment.findMany({ where: { siaId: fixtureSiaId }, select: { id: true } }); fixtureSiaEntities.push(...assignments.map(a => a.id));
      fixtureSiaEntities.push(fixtureSiaId);
      await db.siaRun.deleteMany({ where: { siaId: fixtureSiaId } });
      await db.siaContext.deleteMany({ where: { siaId: fixtureSiaId } });
      await db.siaRoleAssignment.deleteMany({ where: { siaId: fixtureSiaId } });
      await db.siaTool.deleteMany({ where: { siaId: fixtureSiaId } });
      await db.siaIdentity.delete({ where: { id: fixtureSiaId } });
    }
    if (fixtureAgentRoleId) { await db.rolePermission.deleteMany({ where: { roleId: fixtureAgentRoleId } }); await db.role.delete({ where: { id: fixtureAgentRoleId } }); }
    if (fixtureSiaEntities.length) { await db.operationalEvent.deleteMany({ where: { entityId: { in: fixtureSiaEntities } } }); await db.auditEvent.deleteMany({ where: { entityId: { in: fixtureSiaEntities } } }); }
    if (fixtureExecutiveIds.length) { await db.executiveHistory.deleteMany({ where: { recordId: { in: fixtureExecutiveIds } } }); await db.executiveRecord.deleteMany({ where: { id: { in: fixtureExecutiveIds } } }); }
    if (fixtureRequestId) { await db.siaApproval.deleteMany({ where: { requestId: fixtureRequestId } }); await db.operationalRequest.deleteMany({ where: { id: fixtureRequestId } }); }
    if (fixtureInstanceId) { await db.controlCheck.deleteMany({ where: { instanceId: fixtureInstanceId } }); await db.workflowHistory.deleteMany({ where: { instanceId: fixtureInstanceId } }); await db.workflowInstance.deleteMany({ where: { id: fixtureInstanceId } }); }
    if (fixtureDefinitionId) { await db.workflowTransition.deleteMany({ where: { definitionId: fixtureDefinitionId } }); await db.workflowState.deleteMany({ where: { definitionId: fixtureDefinitionId } }); await db.workflowDefinition.deleteMany({ where: { id: fixtureDefinitionId } }); }
    if (fixtureControlId) { await db.approvalRule.deleteMany({ where: { controlPointId: fixtureControlId } }); await db.controlPoint.deleteMany({ where: { id: fixtureControlId } }); }
    if (fixtureTaskId) await db.task.delete({ where: { id: fixtureTaskId } });
    if (fixtureProjectId) await db.project.delete({ where: { id: fixtureProjectId } });
    if (fixtureBatchId) await db.batch.delete({ where: { id: fixtureBatchId } });
    if (fixtureProgramId) await db.program.delete({ where: { id: fixtureProgramId } });
    if (fixtureLocationId) await db.location.delete({ where: { id: fixtureLocationId } });
    if (fixtureProjectId || fixtureProgramId) {
      const ids = [...[fixtureProjectId, fixtureTaskId, fixtureControlId, fixtureDefinitionId, fixtureInstanceId, fixtureRequestId, fixtureProgramId, fixtureBatchId, fixtureLocationId].filter((id): id is string => !!id), ...fixtureApprovalIds];
      const notices = await db.notification.findMany({ where: { resourceId: { in: ids } }, select: { id: true } });
      const entities = [...ids, ...notices.map(n => n.id), ...fixtureExecutiveIds];
      await db.notification.deleteMany({ where: { resourceId: { in: ids } } });
      await db.operationalEvent.deleteMany({ where: { entityId: { in: entities } } });
      await db.auditEvent.deleteMany({ where: { entityId: { in: entities } } });
    }
    if (sessionId) await db.session.deleteMany({ where: { id: sessionId } });
    await db.$disconnect();
  }
}
main().catch(() => { console.error("HTTP smoke failed; inspect controlled assertions without logging raw records."); process.exitCode = 1; });
