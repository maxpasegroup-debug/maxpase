import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

const reportAuth = vi.hoisted(() => ({ allowed: true }));
const eventSpy = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => ({})));
vi.mock("@/server/db", () => ({ prisma: {} }));
vi.mock("@/server/domain/operational-events", () => ({ operationalEvent: eventSpy }));
vi.mock("@/server/portals/policy", () => ({
  requirePortalAccess: vi.fn(async () => ({ companyId: "skillcity-company", ctx: {
    user: { personId: "director-person" },
    requireAccess: async (permission: string, scope: { organizationId: string }) => {
      if (!reportAuth.allowed || permission !== "startup.reports.read" || scope.organizationId !== "startup-division") throw new Error("permission denied");
    },
  } })),
}));

import { createStartupReportsDesk } from "@/server/skillcity/startup-reports-desk";

function fixture() {
  const recordScopes: Record<string, unknown>[] = [];
  const applicantScopes: Record<string, unknown>[] = [];
  const client = {
    organization: {
      findUnique: vi.fn(async () => ({ slug: "aira-skill-city", type: "COMPANY", status: "ACTIVE" })),
      findFirst: vi.fn(async () => ({ id: "startup-division" })),
    },
    brand: { findFirst: vi.fn(async () => ({ id: "startup-brand" })) },
    executiveRecord: { findMany: vi.fn(async (args: { where: Record<string, unknown> }) => { recordScopes.push(args.where); return []; }) },
    startupPublicApplicant: { findMany: vi.fn(async (args: { where: Record<string, unknown> }) => { applicantScopes.push(args.where); return []; }) },
    hrPayrollRun: { findMany: vi.fn(async () => []) },
    hrAssignment: { findMany: vi.fn(async () => []) },
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({})),
  } as unknown as PrismaClient;
  return { client, recordScopes, applicantScopes };
}

describe("Startup Skool Director reports", () => {
  beforeEach(() => { reportAuth.allowed = true; eventSpy.mockClear(); });

  it("requires the explicit scoped reports permission and creates no report event when denied", async () => {
    reportAuth.allowed = false;
    const { client } = fixture();
    await expect(createStartupReportsDesk(client).workspace("director-user")).rejects.toThrow("permission denied");
    expect(eventSpy).not.toHaveBeenCalled();
  });

  it("records access without including applicant or payroll details in the audit event", async () => {
    const { client, recordScopes, applicantScopes } = fixture();
    const report = await createStartupReportsDesk(client).workspace("director-user", { period: "ALL", state: "Kerala" });
    expect(report.filters.state).toBe("Kerala");
    expect(report.leads.total).toBe(0);
    expect(report.finance.payrollRuns).toEqual([]);
    expect(recordScopes.length).toBeGreaterThan(0);
    expect(recordScopes.every(where => where.organizationId === "startup-division")).toBe(true);
    expect(applicantScopes).toEqual([expect.objectContaining({ organizationId: "skillcity-company" })]);
    expect(eventSpy).toHaveBeenCalledOnce();
    const eventInput = eventSpy.mock.calls[0]?.[1] as { action: string; organizationId: string; metadata: unknown } | undefined;
    expect(eventInput).toMatchObject({ action: "startup.reports.viewed", organizationId: "startup-division" });
    expect(JSON.stringify(eventInput?.metadata)).not.toMatch(/applicant|salary|payroll line/i);
  });
});
