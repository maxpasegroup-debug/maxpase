import { z } from "zod";
import { sortWork } from "@/lib/work-list";

export const READ_BUDGET = 5000;
export class QueryBudgetError extends Error {
  constructor() { super("This result exceeds the supported query capacity. Use a narrower authorized list or request an administrator review."); }
}
export const pageInput = z.object({ after: z.string().min(1).max(200).optional(), limit: z.number().int().min(1).max(100).default(50) }).strict();
export type PageInput = z.input<typeof pageInput>;
export async function boundedRead<T>(fetch: (take: number) => Promise<T[]>) {
  const rows = await fetch(READ_BUDGET + 1);
  return checkRows(rows);
}
export function databasePage(page?: PageInput) {
  const parsed = page ? pageInput.parse(page) : undefined;
  return { take: parsed ? parsed.limit + 1 : READ_BUDGET + 1, after: parsed?.after ? { id: { gt: parsed.after } } : {} };
}
export function checkRows<T>(rows: T[]) {
  if (rows.length > READ_BUDGET) throw new QueryBudgetError();
  const inspect = (value: unknown): void => {
    if (Array.isArray(value)) {
      if (value.length > READ_BUDGET) throw new QueryBudgetError();
      value.forEach(inspect);
    } else if (value && typeof value === "object") Object.values(value).forEach(inspect);
  };
  rows.forEach(inspect);
  return rows;
}
export function resultPage<T extends { id: string }>(rows: T[], raw: PageInput = {}, databasePaged = false) {
  const page = pageInput.parse(raw);
  const ordered = databasePaged ? rows : [...rows].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).filter(r => !page.after || r.id > page.after);
  const records = ordered.slice(0, page.limit);
  return { records, nextCursor: ordered.length > page.limit ? records.at(-1)!.id : null };
}
export function sortedResultPage<T extends { id: string; [key: string]: unknown }>(rows: T[], sort: string, raw: PageInput = {}) {
  const page = pageInput.parse(raw), ordered = sortWork(rows, sort);
  const index = page.after ? ordered.findIndex(r => r.id === page.after) : -1;
  // A vanished or inaccessible cursor cannot silently restart a list.
  if (page.after && index < 0) return { records: [] as T[], nextCursor: null };
  const remaining = ordered.slice(index + 1), records = remaining.slice(0, page.limit);
  return { records, nextCursor: remaining.length > page.limit ? records.at(-1)!.id : null };
}
export function groupRows<T>(rows: T[], parent: (row: T) => string) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = parent(row), group = groups.get(key) ?? [];
    group.push(row); groups.set(key, group);
  }
  return groups;
}
