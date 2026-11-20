import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { transpileModule, ModuleKind } from "typescript";

const require = createRequire(import.meta.url);
class AccessError extends Error {}

function loadAction(overrides: Record<string, unknown> = {}) {
  const prepare = vi.fn().mockResolvedValue({ id: "invited-user" });
  const ensureForAppointment = vi.fn().mockResolvedValue({ organizationId: "startup-division", roleId: "startup-director-role" });
  const authority = vi.fn().mockResolvedValue({});
  const employee = {
    create: vi.fn().mockResolvedValue("employment-1"),
    get: vi.fn().mockResolvedValue({
      person: { id: "employee-person" },
      company: { name: "AIRA Skill City Private Limited" },
      assignments: [{ status: "ACTIVE", brand: { name: "Startup Skool" } }]
    })
  };
  const prisma = {
    brand: { findFirst: vi.fn().mockResolvedValue({ id: "startup-brand", slug: "aira-startup-school" }) },
    organization: { findUnique: vi.fn().mockResolvedValue({ id: "startup-division", name: "AIRA Startup Skool" }) },
    employment: { findFirst: vi.fn().mockResolvedValue(null) },
    user: { findUnique: vi.fn().mockResolvedValue({ personId: "boss-person", status: "ACTIVE", emailVerifiedAt: new Date() }) }
  };
  const mocks: Record<string, unknown> = {
    "next/cache": { revalidatePath: vi.fn() },
    "next/navigation": { redirect: vi.fn() },
    "@/server/auth/guards": { requireSession: async () => ({ userId: "boss-user" }) },
    "@/server/authorization/engine": { AccessError },
    "@/server/group/hr-employment": { hrEmploymentService: employee },
    "@/server/group/hr-company-config": { hrCompanyConfig: {} },
    "@/server/group/boss-service": { createBossService: () => ({ authority }) },
    "@/server/skillcity/staff-onboarding": { staffOnboardingService: { prepare, options: vi.fn() } },
    "@/server/skillcity/staff-invite": { staffInvite: { deliveryReady: () => false, send: vi.fn() } },
    "@/server/skillcity/role-templates": {
      skillCityRoleTemplates: { ensureForAppointment },
      resolveStaffRoleTemplate: (scopeSlug: string) => ({ scopeSlug, roleKey: "startup-division-director" })
    },
    "@/server/group/brand-marketing-scope": { marketingDivisionSlug: () => "aira-startup-school" },
    "@/server/db": { prisma },
    "@/server/security/diagnostics": { failureReason: () => "access", safeDiagnostic: () => "test-reference" },
    ...overrides
  };
  const code = transpileModule(readFileSync("src/app/app/boss/departments/[department]/hr-actions.ts", "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const target = { exports: {} as { hrAction?: (state: object, form: FormData) => Promise<{ message?: string; error?: string; employmentId?: string; dashboardReady?: boolean }> } };
  runInNewContext(code, { module: target, exports: target.exports, require: (name: string) => name in mocks ? mocks[name] : require(name) });
  return { action: target.exports.hrAction!, prepare, ensureForAppointment, authority, employee, prisma };
}

function appointmentForm() {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    intent: "appoint",
    companyId: "aira-skill-city-company",
    brandId: "startup-brand",
    designation: "Director",
    displayName: "Synthetic Startup Director",
    email: "director@example.invalid",
    phone: "+919876543210",
    joiningDate: "2026-11-20"
  })) data.set(key, value);
  return data;
}

describe("Boss HR immediate employee dashboard allocation", () => {
  it("creates the employee and assigns the Startup Skool Director role in the Add Employee action", async () => {
    const { action, prepare, ensureForAppointment, authority, employee } = loadAction();
    const result = await action({}, appointmentForm());

    expect(result.error).toBeUndefined();
    expect(result.employmentId).toBe("employment-1");
    expect(result.dashboardReady).toBe(true);
    expect(result.message).toContain("role-based dashboard are assigned");
    expect(authority).toHaveBeenCalledWith("boss-user");
    expect(ensureForAppointment).toHaveBeenCalledWith("boss-user", "aira-skill-city-company", "aira-startup-school", "startup-division-director");
    expect(employee.create).toHaveBeenCalledWith("boss-user", expect.objectContaining({ activateImmediately: true, designation: "Director", initialBrandIds: ["startup-brand"] }));
    expect(prepare).toHaveBeenCalledWith("boss-user", expect.objectContaining({ organizationId: "startup-division", roleId: "startup-director-role", existingPersonId: "employee-person", managerUserId: "boss-user" }));
  });

  it("does not provision staff access when the caller is not the authorized Boss", async () => {
    const unauthorized = new AccessError("Access denied");
    const { action, prepare } = loadAction({ "@/server/group/boss-service": { createBossService: () => ({ authority: vi.fn().mockRejectedValue(unauthorized) }) } });
    const result = await action({}, appointmentForm());
    expect(result.error).toBe("Access denied");
    expect(prepare).not.toHaveBeenCalled();
  });
});
