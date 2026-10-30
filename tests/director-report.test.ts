import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

const state = vi.hoisted(() => ({ view: "director", divisions: [{ id: "labs", name: "AIRA Labs", projects: 26, tasks: null, programs: null, people: null, blockers: 0, sales: 0 }] }));
vi.mock("@/server/skillcity/employee-dashboard", () => ({ createSkillCityEmployeeDashboard: () => ({ dashboard: async () => ({ view: state.view, data: { divisions: state.divisions } }) }) }));
import { createDirectorReport } from "@/server/skillcity/director-report";

describe("Director report source access", () => {
  it("paginates records from the exact authorized division", async () => {
    const updatedAt = new Date("2026-10-30T08:00:00Z");
    const project = { count: vi.fn().mockResolvedValue(26), aggregate: vi.fn().mockResolvedValue({ _max: { updatedAt } }), findMany: vi.fn().mockResolvedValue(Array.from({ length: 26 }, (_, i) => ({ id: `p${i}`, name: `Project ${i}`, status: "ACTIVE", updatedAt }))) };
    const service = createDirectorReport({ project } as unknown as PrismaClient);
    const result = await service.read("director", "labs", "projects");
    expect(result).toMatchObject({ count: 26, nextCursor: "p24" });
    expect(result.rows).toHaveLength(25);
    expect(project.count.mock.calls[0][0].where).toMatchObject({ organizationId: "labs", status: { in: ["PLANNED", "ACTIVE", "BLOCKED"] } });
    await service.read("director", "labs", "projects", "p24");
    expect(project.findMany.mock.calls[1][0].where.id).toEqual({ gt: "p24" });
  });
  it("rejects forged division, unavailable metric and invalid cursor before source reads", async () => {
    const project = { count: vi.fn() };
    const service = createDirectorReport({ project } as unknown as PrismaClient);
    await expect(service.read("director", "other", "projects")).rejects.toThrow("unavailable");
    await expect(service.read("director", "labs", "tasks")).rejects.toThrow("unavailable");
    await expect(service.read("director", "labs", "projects", "")).rejects.toThrow("unavailable");
    state.view = "advisor";
    await expect(service.read("advisor", "labs", "projects")).rejects.toThrow("unavailable");
    state.view = "director";
    expect(project.count).not.toHaveBeenCalled();
  });
});
