import type { PrismaClient } from "@prisma/client";
import { AccessError } from "@/server/authorization/engine";
import { createEmployeeService } from "@/server/nicejobs/employee";
import { createPerformanceService } from "@/server/nicejobs/performance";
import { createFinanceService } from "@/server/nicejobs/finance";
import { checkContextSize, type Selection, type Context } from "./context";
import { resultSchema, type SiaResponse } from "./registry";

export function workerQuestion(message: string) {
  if (/\b(approve|credit|debit|settle|transfer|pay|payout|reverse|withdraw|activate|suspend|terminat\w*|salary|compensation|disciplin\w*|determine failure|recommend termination|assign|reassign|send|import|deadline|delete|grant|override|bypass|sql|shell|execute|publish|acknowledge|archive|modify|edit|create|extend|close|punish|impose)\b/i.test(message)) return false;
  return /wallet|incentive|settlement|balance|leads?|follow.?ups?|contacts?|first|tasks?|overdue|today|day|report|blocked|blocker|briefing|morning|work|help|sop|resource|instructions?|policy|messages?|communications?|changed|performance|improv|metrics?|evidence|attention|objectives?|pip|how am i doing/i.test(message);
}
export async function workerContext(client: PrismaClient, userId: string, s: Selection, ctx: Context): Promise<SiaResponse> {
  const day = await createEmployeeService(client).day(userId, s);
  if (s.projectId || day.assignment.divisionId !== s.organizationId) throw new AccessError("Worker context scope mismatch");
  const facts: SiaResponse["facts"] = day.tasks.map(t => ({ label: t.title, value: `${t.status}; ${t.priority}; ${t.dueDate ? "due " + t.dueDate.toISOString() : "No deadline"}; ${t.description ?? "Instructions not configured"}`, source: "TASK:" + t.id }));
  const performance = createPerformanceService(client);
  let financialContext: { status: string; wallets: unknown[] } = { status: "NOT_AUTHORIZED", wallets: [] };
  try {
    const financial = createFinanceService(client), money = await financial.list(userId, { divisionId: s.organizationId, limit: 3 }, s);
    financialContext = { status: money.records.length ? "AVAILABLE_BOUNDED_WINDOW" : "NOT_CONFIGURED", wallets: money.records.map(w => ({ id: w.id, currency: w.currency, postedMinor: w.postedMinor, pendingMinor: w.pendingMinor, reservedMinor: w.reservedMinor, availableMinor: w.availableMinor, provider: money.provider })) };
    for (const w of money.records) facts.push({ label: "Wallet / " + w.currency, value: `Exact minor units: posted ${w.postedMinor}; pending approval ${w.pendingMinor}; reserved for review ${w.reservedMinor}; available ${w.availableMinor}. Payout provider not configured; no transfer confirmed.`, source: "NICE_JOBS_WALLET:" + w.id });
    for (const w of money.records) {
      const detail = await financial.wallet(userId, w.id, { limit: 3 }, s);
      for (const l of detail.ledger) facts.push({ label: "Wallet entry / " + l.type, value: `${l.amountMinor} ${l.currency} minor units; ${l.description.slice(0, 200)}; earning ${l.earningId ?? "not applicable"}; statement ${l.statementId ?? "not applicable"}; recorded ${l.createdAt.toISOString()}`, source: "NICE_JOBS_WALLET:" + w.id });
    }
    const statements = await financial.records(userId, "statements", { divisionId: s.organizationId, limit: 3 }, s);
    for (const statement of statements.records) facts.push({ label: "Settlement statement", value: `${statement.status}; ${statement.amountMinor} ${statement.currency} minor units; provider not configured; no transfer confirmed.`, source: "NICE_JOBS_STATEMENT:" + statement.id });
  } catch (e) { if (!(e instanceof AccessError)) throw e; }
  let performanceContext: { status: string; records: unknown[]; plans: unknown[]; feedback: unknown[] } = { status: "NOT_AUTHORIZED", records: [], plans: [], feedback: [] };
  try {
    const reports = await performance.list(userId, { limit: 3 }, s);
    performanceContext = { status: reports.records.length ? "AVAILABLE" : "NOT_CONFIGURED", records: reports.records.map(r => ({ id: r.id, frameworkVersion: r.frameworkVersion, periodStart: r.periodStart, periodEnd: r.periodEnd, status: r.status, results: r.results.slice(0, 5) })), plans: [], feedback: [] };
    for (const r of reports.records) for (const m of r.results.slice(0, 5)) facts.push({ label: m.metric.name, value: `${m.status}; expected ${m.metric.target ? JSON.stringify(m.metric.target) : "not configured"}; actual ${m.actual ?? "not measured"}; variance ${m.variance ?? "not measured"}; ${m.coverage}; ${m.calculation}; period ${r.periodStart.toISOString()} to ${r.periodEnd.toISOString()}; source references ${m.evidence.map(e => e.type + ":" + e.id).join(", ")}`, source: "NICE_JOBS_PERFORMANCE:" + r.id });
    if (reports.records[0]) { const d = await performance.detail(userId, reports.records[0].id, false, undefined, s); for (const m of d.results.slice(0, 5)) { const fact = facts.find(f => f.source === "NICE_JOBS_PERFORMANCE:" + d.id && f.label === m.metric.name); if (fact) fact.value += "; authorized evidence: " + (m.evidence.slice(0, 5).map(e => e.type + ":" + e.id).join(", ") || "No currently authorized references available"); } performanceContext.feedback = d.reviews.slice(0, 5).map(r => ({ feedback: r.feedback, followup: r.followup })); for (const r of d.reviews.slice(0, 5)) facts.push({ label: "Released manager feedback", value: r.feedback + (r.followup ? "; Next action: " + r.followup : ""), source: "NICE_JOBS_PERFORMANCE:" + d.id }); }
  } catch (e) { if (!(e instanceof AccessError)) throw e; }
  try {
    const plans = await performance.pips(userId, { limit: 3 }, s);
    for (const p of plans.records) { const d = await performance.pipDetail(userId, p.id, false, undefined, s); performanceContext.plans.push({ id: d.id, title: d.title, status: d.status, workerMessage: d.workerMessage, objectives: d.objectives.slice(0, 5), supportActions: d.supportActions.slice(0, 5), reviewAt: d.reviewAt }); facts.push({ label: d.title, value: `${d.status}; ${d.workerMessage}; review ${d.reviewAt.toISOString()}; ` + d.objectives.slice(0, 5).map(o => `${o.objective}; baseline ${o.baseline}; expected improvement ${o.expectedImprovement}; ${o.status}; due ${o.dueAt}`).join("\n"), source: "NICE_JOBS_PIP:" + d.id }); }
  } catch (e) { if (!(e instanceof AccessError)) throw e; }
  for (const t of day.completed) facts.push({ label: t.title, value: "Completed " + t.completionDate?.toISOString(), source: "TASK:" + t.id });
  for (const b of day.blockers) facts.push({ label: b.reason ?? "Blocker", value: b.description, source: "BLOCKER:" + b.id });
  const reports = day.reports.map(r => ({ id: r.id, date: r.reportDate, revision: r.revision, submittedAt: r.submittedAt, leadWork: r.operationalSnapshot ? JSON.parse(r.operationalSnapshot) : null }));
  for (const source of day.knowledge) for (const item of source.records) {
    facts.push({ label: item.title + " / v" + item.number, value: [item.summary, item.body, ...item.steps.map(step => step.title + ": " + step.instruction + (step.warning ? "; Warning: " + step.warning : "") + (step.escalation ? "; Escalation: " + step.escalation : ""))].filter(Boolean).join("\n"), source: "NICE_JOBS_KNOWLEDGE:" + item.id });
  }
  for (const t of day.overdue) { const fact = facts.find(f => f.source === "TASK:" + t.id); if (fact) fact.value = "Overdue; " + fact.value; else facts.push({ label: t.title, value: "Overdue; due " + t.dueDate?.toISOString(), source: "TASK:" + t.id }); }
  const actions = !day.canReadTasks ? ["Task access is not authorized."] : day.tasks.length ? ["Priority within the current work window: " + day.tasks[0].title] : [day.totals?.assigned ? "No pending work." : "No work assigned yet."];
  if (day.leads.counts) { actions.unshift(day.leads.counts.today + " follow-ups scheduled today; " + day.leads.counts.overdue + " overdue."); for (const l of day.leads.leads) facts.push({ label: l.name, value: l.workflowInstance?.currentState.key + "; " + l.priority, source: "NICE_JOBS_LEAD:" + l.id }); for (const f of day.leads.overdue) facts.push({ label: f.lead.name, value: "Follow-up overdue: " + f.purpose + "; " + f.scheduledAt.toISOString(), source: "NICE_JOBS_LEAD_FOLLOWUP:" + f.id }); } else actions.push("Lead source: " + day.leads.status.replaceAll("_", " ").toLowerCase() + ".");
  if (day.leads.highestPriority) actions.unshift("Highest-priority unresolved lead: " + day.leads.highestPriority.name + " / " + day.leads.highestPriority.priority + ".");
  if (day.blockers.length) actions.push("Open blockers are waiting for an authorized manager's review.");
  if (!day.knowledge.some(source => source.records.length)) actions.push("I couldn't find an authorized SOP/resource or communication for that. Ask your manager to publish applicable instructions.");
  else actions.push("Knowledge is a bounded authorized window; open SOP, Resources or Messages for the exact published version. Acknowledgements require your explicit platform confirmation.");
  actions.push(performanceContext.status === "AVAILABLE" ? "Performance reflects configured expectations and recorded evidence. Ask your manager for support; SIA cannot create, extend or close an improvement plan or make employment decisions." : "Performance expectations or authorized evidence are not configured/available; no score or target is assumed.");
  if (day.canReport) actions.push(day.reports.some(r => r.reportDate === day.date) ? "Today's report is submitted. Corrections require an explicit new record." : "Review your actual completed and pending work, then explicitly submit today's report.");
  if (day.canBlock) actions.push("To report a blocker, choose a related assigned task if applicable, enter a reason and description, and confirm the platform form.");
  const response = resultSchema.parse({ facts, signals: [], recommendations: [], actions, approvals: [], limitations: ["Read-only deterministic assistance; no model-generated completion or business action.", "Training, hiring history, unrelated workers and management-only records are excluded.", "Task changes, reminders, blockers and reports require an explicit authorized platform confirmation.", ...(day.truncated ? ["Context is a bounded window, not all work. Open My Work for remaining records."] : [])], provider: "DETERMINISTIC_DOMAIN_EVIDENCE", calculatedAt: day.asOf.toISOString(), context: { worker: day.assignment.name, company: day.assignment.company, division: day.assignment.division, job: day.assignment.title, version: day.assignment.version, assignmentId: day.assignment.id, date: day.date, timezone: day.timezone, performance: performanceContext, knowledge: day.knowledge, leads: day.leads, totals: day.totals, dueToday: day.today, overdue: day.overdue, goals: day.goals, notifications: day.notifications, tasks: day.tasks, completed: day.completed, blockers: day.blockers, reports, coverage: day.truncated ? "BOUNDED_WINDOW" : "AVAILABLE_WINDOW" } });
  checkContextSize(response);
  response.context.financial = financialContext;
  response.limitations.push("Financial assistance is read-only. SIA cannot approve, post credit/debit, reverse, settle, request payout or change compensation.");
  checkContextSize(response);
  if (!ctx.active) throw new AccessError("Access denied");
  return response;
}
