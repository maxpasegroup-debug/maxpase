import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

const guard = vi.hoisted(() => ({ denied: false, deniedExecutive: false, brandDenied: false }));
vi.mock("@/server/group/boss-registry", () => ({ createBossRegistry: () => ({ brand: async (_userId: string, brandId: string) => {
  if (guard.brandDenied || brandId !== "startup-brand") throw new Error("Brand unavailable");
  return { row: { id: brandId, organizationId: "aira-company", name: "Startup School", status: "ACTIVE", organization: { status: "ACTIVE", company: { status: "ACTIVE" } } }, startupDivision: "startup-division", startupDivisionActive: true, programs: [], canManagePrograms: true };
} }) }));
vi.mock("@/server/group/boss-service", () => ({ createBossService: () => ({ authority: async () => ({ ctx: {
  requireAccess: async (key: string) => { if (guard.denied && key === "person.read" || guard.deniedExecutive && key === "executive.read") throw new Error("Access denied"); },
  decide: async () => ({ allowed: true })
} }) }) }));

import { createStartupAdmissions } from "@/server/group/startup-admissions";
import { createStartupApplications } from "@/server/portals/startup-applications";

describe("Boss Startup admissions read boundary", () => {
  it("queries real application records only after scoped identity and person access", async () => {
    const findMany = vi.fn(async () => []);
    const groupBy = vi.fn(async () => [{ status: "SUBMITTED", _count: { _all: 2 } }]);
    const client = { executiveRecord: { findMany, groupBy }, program: { findMany: vi.fn(async () => []) } } as unknown as PrismaClient;
    const result = await createStartupAdmissions(client).list("boss", "startup-brand", { search: "  Meera ", status: "SUBMITTED" });
    expect(result.counts).toMatchObject({ SUBMITTED: 2, APPROVED: 0 });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: "startup-division", kind: "STARTUP_APPLICATION", status: "SUBMITTED", owner: { displayName: { contains: "Meera", mode: "insensitive" } } }) }));
    guard.denied = true;
    await expect(createStartupAdmissions(client).list("boss", "startup-brand")).rejects.toThrow("Access denied");
    expect(findMany).toHaveBeenCalledTimes(1);
    guard.denied = false;
    guard.deniedExecutive = true;
    await expect(createStartupAdmissions(client).list("boss", "startup-brand")).rejects.toThrow("Access denied");
    guard.deniedExecutive = false;
    expect(findMany).toHaveBeenCalledTimes(1);
    await expect(createStartupAdmissions(client).list("boss", "foreign-brand")).rejects.toThrow("Brand unavailable");
    expect(findMany).toHaveBeenCalledTimes(1);
  });
  it("never falls back to the staff review path when the Boss brand ID is empty", async () => {
    const db = { brand: { findUnique: vi.fn(async () => null) } };
    const client = { $transaction: async (callback: (transaction: typeof db) => Promise<unknown>) => callback(db) } as unknown as PrismaClient;
    await expect(createStartupApplications(client).reviewForBoss("staff-account", "", { id: "application", version: 0, decision: "APPROVED", reason: "Reviewed by a person" })).rejects.toThrow("Startup School brand unavailable");
    expect(db.brand.findUnique).toHaveBeenCalledWith({ where: { id: "" }, select: expect.any(Object) });
  });
});
