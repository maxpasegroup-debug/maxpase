import { z } from "zod";
import { requiredUtcDate, projectStatuses, taskStatuses, goalStatuses } from "@/server/domain/execution-input";
import { attentionStates, decisionStates, riskStates, opportunityStates, severities } from "@/server/domain/executive-input";
import type { createExecutiveService } from "@/server/domain/executive-service";

export const bossStatuses = [...new Set([...projectStatuses, ...taskStatuses, ...goalStatuses, ...attentionStates, ...decisionStates, ...riskStates, ...opportunityStates, "OPEN", "FAILED", "SUCCEEDED", "PROCESSING", "EXPIRED", "READ", "UNREAD", "ON_TRACK", "OFF_TRACK", "NO_DATA"])];
export const bossFilterKeys = ["projectId", "productId", "from", "until", "severity", "status"] as const;
const id = z.string().min(1).max(200);
export const bossFilter = z.object({
  projectId: id.optional(), productId: id.optional(), from: requiredUtcDate.optional(), until: requiredUtcDate.optional(),
  severity: z.enum(severities).optional(), status: z.string().refine(s => bossStatuses.includes(s), "Invalid status").optional()
}).strict().refine(v => !v.from || !v.until || v.from <= v.until, "Invalid period");
export type BossFilter = z.infer<typeof bossFilter>;
export function parseBossFilters(query: Record<string, string | string[] | undefined>) {
  const raw = Object.fromEntries(bossFilterKeys.flatMap(k => query[k] ? [[k, query[k]]] : []));
  if (typeof raw.until === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.until)) raw.until += "T23:59:59.999Z";
  return bossFilter.parse(raw);
}
export function bossHref(view: string, companyId: string | undefined, query: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams({ view });
  if (companyId) params.set("companyId", companyId);
  for (const key of bossFilterKeys) if (typeof query[key] === "string" && query[key]) params.set(key, query[key]);
  return `/app/boss?${params}`;
}
export function matchesBossRow(row: { status?: string; updatedAt?: Date; createdAt?: Date; handlingStatus?: string; severity?: string }, filter: BossFilter) {
  const updated = row.updatedAt ?? row.createdAt;
  return (!filter.status || (row.handlingStatus ?? row.status) === filter.status)
    && (!filter.severity || row.severity === undefined || row.severity === filter.severity)
    && (!filter.from || !!updated && updated >= filter.from)
    && (!filter.until || !!updated && updated <= filter.until);
}
type ExecutiveData = Awaited<ReturnType<ReturnType<typeof createExecutiveService>["dashboard"]>>;
// Filter visible rows after intelligence calculation; hiding work must not erase its health evidence.
export function filterBossExecutive(data: ExecutiveData, filter: BossFilter): ExecutiveData {
  const rows = <T extends Parameters<typeof matchesBossRow>[0]>(items: T[]) => items.filter(r => matchesBossRow(r, filter));
  const attention = rows(data.attention);
  const sources = [...data.projects, ...data.goals, ...data.tasks, ...data.records, ...Object.values(data.operations).flat()];
  const changes = data.changes.filter(change => (!filter.from || change.createdAt >= filter.from) && (!filter.until || change.createdAt <= filter.until)
    && (!filter.status || sources.some(s => s.id === change.entityId && s.status === filter.status)));
  const records = data.records.filter(r => matchesBossRow({ ...r, severity: r.payload.severity }, filter));
  return { ...data, projects: rows(data.projects), goals: rows(data.goals), tasks: rows(data.tasks),
    records, attention, changes, decisions: rows(data.decisions), deadlines: rows(data.deadlines), wins: rows(data.wins),
    operations: Object.fromEntries(Object.entries(data.operations).map(([key, items]) => [key, rows(items)])),
    briefing: { ...data.briefing, changes: changes.filter(c => data.briefing.changes.some(b => b.id === c.id)), attention, deadlines: rows(data.briefing.deadlines), blockedWork: rows(data.briefing.blockedWork), concerns: rows(data.briefing.concerns), wins: rows(data.briefing.wins) }
  };
}
export function companyEvidence(metrics: ExecutiveData["metrics"], rows: { updatedAt: Date }[], calculatedAt: Date) {
  const lastUpdated = rows.reduce<Date | null>((last, r) => !last || r.updatedAt > last ? r.updatedAt : last, null);
  return { readableMetrics: metrics.filter(m => m.value !== null).length, totalMetrics: metrics.length, recordCount: rows.length,
    lastUpdated, calculatedAt, freshness: !lastUpdated ? "NO RECORDED WORK" : calculatedAt.getTime() - lastUpdated.getTime() > 7 * 86400000 ? "LAST RECORD UPDATE OVER 7 DAYS AGO" : "RECORD UPDATED WITHIN 7 DAYS",
    coverage: "Authorized records only; not a complete company assessment" };
}
