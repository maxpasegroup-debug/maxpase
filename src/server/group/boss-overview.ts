import { z } from "zod";
import type { createExecutiveService } from "../domain/executive-service";
import { portalSites } from "../portals/sites";
import { bossFilterKeys } from "./boss-reliability";

type Snapshot = Awaited<ReturnType<ReturnType<typeof createExecutiveService>["dashboard"]>>;
type Row = Snapshot["tasks"][number];
export const overviewQueues = { decisions: "Pending decisions", approvals: "My pending approvals", overdue: "Overdue work", blockers: "Unresolved blockers", escalations: "Unresolved escalations", failures: "Failed events", deadlines: "Next seven days", concerns: "Goal & performance concerns" } as const;
export type OverviewQueue = keyof typeof overviewQueues;
export const overviewInventories = { companies: "Companies", brands: "Active brands", products: "Active products", projects: "Projects", goals: "Goals", tasks: "Tasks", critical: "Critical attention" } as const;
export type OverviewInventory = keyof typeof overviewInventories;
export const overviewSelection = z.object({ queue: z.enum(Object.keys(overviewQueues) as [OverviewQueue, ...OverviewQueue[]]).optional(), inventory: z.enum(Object.keys(overviewInventories) as [OverviewInventory, ...OverviewInventory[]]).optional(), item: z.string().min(1).max(220).optional() }).strict().refine(v => (!v.item || !!v.queue) && !(v.queue && v.inventory));
const closed = new Set(["COMPLETED", "CANCELLED", "ARCHIVED", "ACHIEVED", "MISSED", "RESOLVED", "CLOSED", "EXPIRED", "REJECTED", "APPROVED"]);
const weights: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, NORMAL: 2, LOW: 1 };
export const overviewKey = (row: Pick<Row, "type" | "id">) => `${row.type}:${row.id}`;
export function overviewHref(queue: OverviewQueue, companyId?: string, item?: string, query: Record<string, string | string[] | undefined> = {}) {
  const params = new URLSearchParams({ view: "overview", queue });
  if (companyId) params.set("companyId", companyId);
  if (item) params.set("item", item);
  for (const key of bossFilterKeys) if (typeof query[key] === "string" && query[key]) params.set(key, query[key]);
  return `/app/boss?${params}`;
}
export function inventoryHref(inventory: OverviewInventory, companyId?: string, query: Record<string, string | string[] | undefined> = {}) {
  const params = new URLSearchParams({ view: "overview", inventory });
  if (companyId) params.set("companyId", companyId);
  for (const key of bossFilterKeys) if (typeof query[key] === "string" && query[key]) params.set(key, query[key]);
  return `/app/boss?${params}`;
}
export function buildBossOverview(data: Snapshot, timezone: string, decisionReadable = false) {
  const now = data.calculatedAt;
  const unique = (rows: Row[]) => [...new Map(rows.map(row => [overviewKey(row), row])).values()];
  const signals = new Map<string, number>();
  for (const signal of data.attention) signals.set(overviewKey(signal), Math.max(signals.get(overviewKey(signal)) ?? 0, weights[signal.severity] ?? 2));
  const severity = (r: Row) => Math.max(weights[r.priority] ?? 2, ["BLOCKER", "ESCALATION", "EVENT"].includes(r.type) || r.status === "BLOCKED" ? 3 : 0, signals.get(overviewKey(r)) ?? 0);
  const sort = (rows: Row[]) => unique(rows).sort((a, b) => severity(b) - severity(a) || (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity) || overviewKey(a).localeCompare(overviewKey(b)));
  const queues: Record<OverviewQueue, Row[]> = {
    decisions: data.decisions.filter(r => r.type === "DECISION"),
    approvals: data.decisions.filter(r => r.type === "APPROVAL"),
    overdue: [...data.tasks, ...data.projects, ...data.goals, ...data.milestones].filter(r => r.dueAt && r.dueAt < now && !closed.has(r.status)),
    blockers: [...data.projects.filter(p => p.status === "BLOCKED"), ...data.blockers.filter(r => r.status === "OPEN")],
    escalations: (data.operations.ESCALATION ?? []).filter(r => !closed.has(r.status)),
    failures: (data.operations.EVENT ?? []).filter(r => r.status === "FAILED"),
    deadlines: data.deadlines,
    concerns: data.attention.filter(r => ["GOAL", "KPI"].includes(r.type) && !["RESOLVED", "DISMISSED"].includes(r.handlingStatus)),
  };
  for (const key of Object.keys(queues) as OverviewQueue[]) queues[key] = sort(queues[key]);
  const canAct = (r: Row) => r.type === "APPROVAL" ? r.actionable === true && (!r.dueAt || r.dueAt > now) : r.type === "DECISION" ? data.records.find(record => record.id === r.id)?.canDecide === true && r.status === "PENDING" : false;
  const nextAction = (r: Row) => r.type === "APPROVAL" ? canAct(r) ? "Review the request and make a human approval decision" : r.dueAt && r.dueAt <= now ? "Approval expiry reached; review the request with its requester" : "Waiting for policy, an earlier approval stage or request readiness" : r.type === "DECISION" ? canAct(r) ? "Review options and record your decision" : "Follow up with the designated decision maker" : r.type === "EVENT" ? "Inspect the recorded failure before any retry" : r.type === "ESCALATION" ? "Contact the responsible person and agree a resolution" : "Review the work with its owner and agree the next step";
  const candidates = (Object.keys(queues) as OverviewQueue[]).filter(q => q !== "deadlines").flatMap(queue => queues[queue].map(row => ({ queue, row })));
  // Actionable human decisions lead within a severity tier; never authorize a mutation here.
  candidates.sort((a, b) => severity(b.row) - severity(a.row) || Number(canAct(b.row)) - Number(canAct(a.row)) || (a.row.dueAt?.getTime() ?? Infinity) - (b.row.dueAt?.getTime() ?? Infinity) || overviewKey(a.row).localeCompare(overviewKey(b.row)));
  const seen = new Set<string>();
  const urgent = candidates.filter(item => { const key = overviewKey(item.row); if (seen.has(key)) return false; seen.add(key); return true; });
  const localDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const changesToday = data.changes.filter(c => localDay(c.createdAt) === localDay(now));
  const owner = (r: Row) => r.ownerPersonId ? data.options.people.find(p => p.id === r.ownerPersonId)?.name ?? "Owner outside visible people records" : "Owner not recorded";
  const coverage: Record<OverviewQueue, boolean> = {
    decisions: decisionReadable || data.records.some(r => r.kind === "DECISION"),
    approvals: data.metrics.some(m => m.source === "APPROVAL" && m.value !== null),
    overdue: data.metrics.some(m => ["TASK", "PROJECT", "GOAL"].includes(m.source) && m.value !== null),
    blockers: data.metrics.some(m => m.source === "PROJECT" && m.value !== null) || queues.blockers.length > 0,
    escalations: data.metrics.some(m => m.source === "ESCALATION" && m.value !== null),
    failures: data.metrics.some(m => m.source === "EVENT" && m.value !== null),
    deadlines: data.metrics.some(m => ["TASK", "PROJECT", "GOAL"].includes(m.source) && m.value !== null),
    concerns: data.metrics.some(m => m.source === "GOAL" && m.value !== null) || queues.concerns.length > 0,
  };
  return { queues, urgent, canAct, nextAction, owner, coverage, timezone, day: localDay(now), changesToday };
}

const recordedCheck = z.object({ hostname: z.string().max(253), responsiblePersonId: z.string().max(200).optional(), ownership: z.object({ source: z.string().min(1).max(300), checkedAt: z.iso.datetime() }).optional(), routing: z.object({ source: z.string().min(1).max(300), checkedAt: z.iso.datetime() }).optional(), certificate: z.object({ source: z.string().min(1).max(300), checkedAt: z.iso.datetime(), validUntil: z.iso.datetime(), issuer: z.string().min(1).max(200) }).optional() }).strict();
export function domainEvidence(website: string | null, metadata: string | null, now = new Date()) {
  let hostname: string | null = null;
  try { if (website) { const url = new URL(website); if (["https:", "http:"].includes(url.protocol)) hostname = url.hostname.toLowerCase(); } } catch { /* Invalid legacy websites are not evidence. */ }
  const route = hostname === "maxpase.com" || hostname === "www.maxpase.com" ? "MAXPASE / group sign-in" : portalSites.find(s => hostname === s.domain || hostname === `www.${s.domain}`)?.name ?? null;
  let evidence: z.infer<typeof recordedCheck> | null = null;
  try { const parsed = recordedCheck.safeParse(JSON.parse(metadata ?? "{}").domainEvidence); if (parsed.success && parsed.data.hostname.toLowerCase() === hostname) evidence = parsed.data; } catch { /* Malformed or host-mismatched claims are not shown. */ }
  const check = (entry?: { source: string; checkedAt: string }) => !entry ? "NOT RECORDED" : new Date(entry.checkedAt) > now ? "INVALID FUTURE CHECK" : now.getTime() - new Date(entry.checkedAt).getTime() > 7 * 86400000 ? "STALE RECORDED CHECK" : "RECORDED CHECK / NOT INDEPENDENTLY VERIFIED";
  return { hostname, route, evidence, ownership: check(evidence?.ownership), routing: check(evidence?.routing), certificate: evidence?.certificate && new Date(evidence.certificate.validUntil) <= now ? "EXPIRED RECORDED CERTIFICATE" : check(evidence?.certificate) };
}
