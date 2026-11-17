import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

const authState = vi.hoisted(() => ({ authorized: true }));
vi.mock("@/server/db", () => ({ prisma: {} }));
vi.mock("@/server/portals/policy", () => ({ requirePortalAccess: vi.fn(async () => ({ companyId: "skillcity-company", ctx: { user: { personId: "ao-person" }, grants: authState.authorized ? [{ organizationId: "skillcity-company", roleName: "Administrative Officer" }] : [], decide: async () => ({ allowed: authState.authorized }), requireAccess: async () => { if (!authState.authorized) throw new Error("permission denied"); } } })) }));
vi.mock("@/server/group/boss-service", () => ({ createBossService: () => ({ authority: vi.fn() }) }));

import { createStartupAdmissionsDesk } from "@/server/skillcity/startup-admissions-desk";

function fixture() {
  const whereQueries: Record<string, unknown>[] = [];
  const app = { id: "public-app-12345678", reference: "SIA-TEST-1", fullName: "Test Applicant", mobile: "+919876543210", email: "person@example.test", state: "Kerala", district: "Ernakulam", preferredCentre: null, programPreference: "PBA_30_DAYS", entrepreneurialStage: "IDEA", businessInterest: "Local food business", goals: "Build a business", referralSnapshot: "{}", phoneVerifiedAt: new Date("2026-01-01T00:00:00Z"), consentVersion: "startup-public-sia-v1", status: "SUBMITTED", version: 1, submittedAt: new Date("2026-01-02T00:00:00Z"), createdAt: new Date("2026-01-01T00:00:00Z"), events: [] };
  const client = {
    organization: { findUnique: vi.fn(async () => ({ slug: "aira-skill-city", type: "COMPANY", status: "ACTIVE" })), findFirst: vi.fn(async () => ({ id: "startup-division" })) },
    startupAdmissionAssignment: { findMany: vi.fn(async () => [{ applicantId: app.id, assignedUserId: "ao-user", assignedAt: new Date() }]) },
    executiveRecord: { findMany: vi.fn(async () => []), count: vi.fn(async () => 0) },
    startupPublicApplicant: { findMany: vi.fn(async (args: { where: Record<string, unknown> }) => { whereQueries.push(args.where); return [app]; }), count: vi.fn(async () => 1) },
    startupAdmissionFollowUp: { findMany: vi.fn(async () => []) },
    membership: { findMany: vi.fn(async () => []) },
  } as unknown as PrismaClient;
  return { client, whereQueries, app };
}

describe("Startup AO admissions desk access", () => {
  beforeEach(() => { authState.authorized = true; });

  it("restricts an AO inbox query to applications currently assigned to that signed-in user", async () => {
    const { client, whereQueries, app } = fixture();
    const page = await createStartupAdmissionsDesk(client).page("ao-user", { page: 1 });
    expect(page.cases).toHaveLength(1);
    expect(page.cases[0]?.reference).toBe(app.reference);
    expect(whereQueries.some(where => JSON.stringify(where.id) === JSON.stringify({ in: [app.id] }))).toBe(true);
  });

  it("rejects access when explicit Startup permissions are not granted", async () => {
    authState.authorized = false;
    await expect(createStartupAdmissionsDesk(fixture().client).page("unprivileged-user")).rejects.toThrow("not authorized");
  });

  it("returns an empty AO queue when no cases are assigned", async () => {
    const { client } = fixture();
    vi.mocked(client.startupAdmissionAssignment.findMany).mockResolvedValue([] as never);
    const page = await createStartupAdmissionsDesk(client).page("ao-user");
    expect(page.cases).toEqual([]);
    expect(page.overview.total).toBe(0);
  });
});
