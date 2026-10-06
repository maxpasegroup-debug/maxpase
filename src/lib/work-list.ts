import { z } from "zod";

export const workSort = z.enum(["reference", "newest", "oldest", "deadline", "title"]);
export function withinOrganization(id: string, scope: string, nodes: { id: string; parentId?: string | null }[]) {
  const parents = new Map(nodes.map(n => [n.id, n.parentId])), visited = new Set<string>();
  let current: string | null | undefined = id;
  while (current && !visited.has(current)) { if (current === scope) return true; visited.add(current); current = parents.get(current); }
  return false;
}
export const workSortOptions = [{ id: "reference", name: "Reference" }, { id: "newest", name: "Newest first" }, { id: "oldest", name: "Oldest first" }, { id: "deadline", name: "Earliest deadline" }, { id: "title", name: "Title A-Z" }];
export const savedFilterKeys = ["search", "organizationId", "projectId", "status", "ownerPersonId", "assigneePersonId", "priority", "dueBefore", "overdue", "requesterUserId", "approverUserId", "actorUserId", "entityId", "type", "read", "from", "until", "sort"];
export const savedFilterInput = z.object({ name: z.string().trim().min(1).max(60), filters: z.record(z.string(), z.string().max(200)).refine(v => Object.keys(v).every(k => savedFilterKeys.includes(k))) }).strict();
export const savedFilterList = z.array(savedFilterInput).max(10);
export function savedFilterStorageKey(userId: string, path: string, query: URLSearchParams) {
  return `maxpase:filters:v2:${userId}:${path}:${query.get("companyId") ?? query.get("organizationId") ?? "group"}`;
}
export function filterValues(query: URLSearchParams) { return Object.fromEntries(savedFilterKeys.flatMap(k => query.has(k) ? [[k, query.get(k)!]] : [])); }
export function restoreFilter(current: URLSearchParams, filters: Record<string, string>) {
  const query = new URLSearchParams(current);
  for (const key of [...savedFilterKeys, "cursor", "recordId", "create"]) query.delete(key);
  for (const [key, value] of Object.entries(filters)) if (savedFilterKeys.includes(key)) query.set(key, value);
  return query;
}
export function sortWork<T extends { id: string; [key: string]: unknown }>(rows: T[], raw: unknown) {
  const sort = workSort.parse(raw ?? "reference");
  const stamp = (r: T, deadline = false) => {
    const value = deadline ? r.remindAt ?? r.dueAt ?? r.dueDate ?? r.targetDate ?? r.expectedResolution ?? r.expiresAt ?? r.nextRunAt : r.createdAt;
    const time = value == null ? NaN : value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
    return Number.isFinite(time) ? time : null;
  };
  return [...rows].sort((a, b) => {
    let order = 0;
    if (sort === "title") order = String(a.title ?? a.name ?? a.reason ?? a.eventType ?? "").localeCompare(String(b.title ?? b.name ?? b.reason ?? b.eventType ?? ""), "en");
    if (["newest", "oldest", "deadline"].includes(sort)) {
      const x = stamp(a, sort === "deadline"), y = stamp(b, sort === "deadline");
      order = x === null ? y === null ? 0 : 1 : y === null ? -1 : (x - y) * (sort === "newest" ? -1 : 1);
    }
    return order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
}
