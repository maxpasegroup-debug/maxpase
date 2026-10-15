import type { PrismaClient } from "@prisma/client";
import { AccessError } from "@/server/authorization/engine";
import { createSkillCityEmployeeDashboard } from "@/server/skillcity/employee-dashboard";
import { checkContextSize, toolAuthority, type Selection } from "./context";
import { resultSchema, type SiaResponse } from "./registry";

export async function advisorContext(client: PrismaClient, userId: string, scope: Selection): Promise<SiaResponse> {
  if (scope.projectId) throw new AccessError("Advisor briefing requires the assigned Labs division");
  const desk = await createSkillCityEmployeeDashboard(client).dashboard(userId, "advisor");
  if (!desk.data || !("leads" in desk.data) || !Array.isArray(desk.data.leads) || desk.data.labsId !== scope.organizationId) throw new AccessError("Advisor scope unavailable");
  const now = new Date();
  const leads = desk.data.leads.slice(0, 30);
  const due = leads.filter(lead => {
    const next = lead.nextFollowUp ?? lead.dueAt;
    return next && new Date(next).getTime() <= now.getTime();
  });
  const facts: SiaResponse["facts"] = leads.map(lead => ({ label: lead.title, value: `${lead.status}; next follow-up ${lead.nextFollowUp ?? lead.dueAt ?? "not scheduled"}; last outcome ${lead.outcome || "not recorded"}`, source: `LABS_LEAD:${lead.id}` }));
  const actions = due.length ? [`Review ${due.length} due or overdue assigned follow-ups in the current page.`, `Start with ${due[0].title}; verify the last outcome before contacting the prospect.`] : leads.length ? ["Review assigned open enquiries and schedule the next authorized follow-up."] : ["No assigned open Labs enquiries in this page. Ask your manager for an assignment or approved guidance."];
  actions.push("Use only approved product disclosures; BGOS, PBA and GenZ Builder draft terms are not sale-ready.");
  const fresh = await toolAuthority(client, userId, scope, "get_advisor_day");
  if (!fresh.active) throw new AccessError("Advisor access changed");
  const response = resultSchema.parse({ facts, signals: [], recommendations: due.slice(0, 3).map(lead => ({ observation: `Assigned follow-up due: ${lead.title}`, evidence: [`LABS_LEAD:${lead.id}`], interpretation: "Recorded due date is at or before now; this is not a conversion prediction.", recommendation: "Review the prospect's last outcome and record the next authorized action.", expectedBenefit: "A timely, documented follow-up", risk: "Human advisor must verify consent, product terms and the customer context", affectedEntities: [lead.id], confidence: "RULE_BASED", nextAction: "Open this lead in the assigned queue" })), actions, approvals: [], limitations: ["Deterministic, read-only draft guidance based only on this advisor's assigned Labs leads.", "The queue is bounded to 30 records. PBA and GenZ Builder pipelines are not configured here.", "SIA cannot contact customers, decide employment, change pay or approve financial actions."], provider: "DETERMINISTIC_DOMAIN_EVIDENCE", calculatedAt: now.toISOString(), context: { leadIds: leads.map(lead => lead.id), dueCount: due.length, coverage: "ASSIGNED_LABS_WINDOW" } });
  checkContextSize(response);
  return response;
}
