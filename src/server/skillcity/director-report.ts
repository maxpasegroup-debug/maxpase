import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { AccessError } from "@/server/authorization/engine";
import { createSkillCityEmployeeDashboard } from "./employee-dashboard";

export const directorReportKinds = ["projects", "tasks", "programs", "people", "blockers", "sales"] as const;
export type DirectorReportKind = typeof directorReportKinds[number];
const id = z.string().min(1).max(200);
const metricKey: Record<DirectorReportKind, DirectorReportKind> = { projects: "projects", tasks: "tasks", programs: "programs", people: "people", blockers: "blockers", sales: "sales" };

export function createDirectorReport(client: PrismaClient = prisma) {
  async function read(userId: string, rawDivisionId: string, rawKind: string, rawCursor?: string) {
    const scope = id.safeParse(rawDivisionId), selected = z.enum(directorReportKinds).safeParse(rawKind), pageCursor = rawCursor !== undefined ? id.safeParse(rawCursor) : null;
    if (!scope.success || !selected.success || pageCursor && !pageCursor.success) throw new AccessError("Director report unavailable");
    const divisionId = scope.data, kind = selected.data, cursor = pageCursor?.data;
    const dashboard = await createSkillCityEmployeeDashboard(client).dashboard(userId, "director");
    if (dashboard.view !== "director" || !dashboard.data || !("divisions" in dashboard.data)) throw new AccessError("Director report unavailable");
    const division = dashboard.data.divisions.find(row => row.id === divisionId);
    if (!division || division[metricKey[kind]] === null) throw new AccessError("Director report unavailable");
    const page = { take: 26, orderBy: { id: "asc" } as const };
    const after = cursor ? { id: { gt: cursor } } : {};
    let count: number, lastUpdated: Date | null, rows: { id: string; title: string; status: string; updatedAt: Date }[];
    if (kind === "projects" || kind === "blockers") {
      const where = { organizationId: divisionId, status: kind === "blockers" ? "BLOCKED" as const : { in: ["PLANNED", "ACTIVE", "BLOCKED"] as ("PLANNED" | "ACTIVE" | "BLOCKED")[] } };
      count = await client.project.count({ where });
      lastUpdated = (await client.project.aggregate({ where, _max: { updatedAt: true } }))._max.updatedAt;
      rows = (await client.project.findMany({ where: { ...where, ...after }, ...page, select: { id: true, name: true, status: true, updatedAt: true } })).map(row => ({ ...row, title: row.name }));
    } else if (kind === "tasks") {
      const where = { organizationId: divisionId, status: { notIn: ["COMPLETED", "CANCELLED"] as ("COMPLETED" | "CANCELLED")[] } };
      count = await client.task.count({ where });
      lastUpdated = (await client.task.aggregate({ where, _max: { updatedAt: true } }))._max.updatedAt;
      rows = await client.task.findMany({ where: { ...where, ...after }, ...page, select: { id: true, title: true, status: true, updatedAt: true } });
    } else if (kind === "programs") {
      const where = { organizationId: divisionId, status: "ACTIVE" as const };
      count = await client.program.count({ where });
      lastUpdated = (await client.program.aggregate({ where, _max: { updatedAt: true } }))._max.updatedAt;
      rows = (await client.program.findMany({ where: { ...where, ...after }, ...page, select: { id: true, name: true, status: true, updatedAt: true } })).map(row => ({ ...row, title: row.name }));
    } else if (kind === "people") {
      const where = { organizationId: divisionId, projectId: null, status: "ACTIVE" as const };
      count = await client.membership.count({ where });
      lastUpdated = (await client.membership.aggregate({ where, _max: { updatedAt: true } }))._max.updatedAt;
      rows = (await client.membership.findMany({ where: { ...where, ...after }, ...page, select: { id: true, title: true, status: true, updatedAt: true } })).map(row => ({ ...row, title: row.title || "Division membership" }));
    } else {
      const where = { organizationId: divisionId, kind: "LABS_LEAD", status: { notIn: ["WON", "LOST"] } };
      count = await client.executiveRecord.count({ where });
      lastUpdated = (await client.executiveRecord.aggregate({ where, _max: { updatedAt: true } }))._max.updatedAt;
      rows = await client.executiveRecord.findMany({ where: { ...where, ...after }, ...page, select: { id: true, title: true, status: true, updatedAt: true } });
    }
    const hasMore = rows.length > 25, visible = rows.slice(0, 25);
    return { division: { id: division.id, name: division.name }, kind, count, rows: visible, nextCursor: hasMore ? visible.at(-1)!.id : null, lastUpdated, calculatedAt: new Date() };
  }
  return { read };
}
export const directorReport = createDirectorReport();
