import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { transpileModule, ModuleKind } from "typescript";

const require = createRequire(import.meta.url);
class AccessError extends Error {}

function loadAction(options: { account?: { id: string } | null; employmentStatus?: string; roleName?: string; targetId?: string; brandId?: string | null } = {}) {
  const prepare = vi.fn().mockResolvedValue({ status: "DRAFT" });
  const employment = { status: options.employmentStatus ?? "ACTIVE", person: { id: "person-1", email: "employee@example.invalid" } };
  const targetId = options.targetId ?? "labs";
  const mocks: Record<string, unknown> = {
    "next/cache": { revalidatePath: vi.fn() },
    "@/server/auth/guards": { requireSession: async () => ({ userId: "boss-1" }) },
    "@/server/authorization/engine": { AccessError },
    "@/server/group/hr-access": { hrAccess: { overview: async () => ({ account: options.account ?? null, targets: [{ id: targetId, brandId: options.brandId === undefined ? "labs-brand" : options.brandId, name: "AIRA Labs" }] }) } },
    "@/server/group/hr-employment": { hrEmploymentService: { get: async () => employment } },
    "@/server/skillcity/staff-onboarding": { staffOnboardingService: { options: async () => ({ canPrepare: true, roles: [{ id: "role-1", name: options.roleName ?? "Full Stack Developer" }] }), prepare } },
    "@/server/skillcity/staff-invite": { staffInvite: {} },
    "@/server/security/diagnostics": { safeDiagnostic: vi.fn() }
  };
  const code = transpileModule(readFileSync("src/app/app/boss/departments/[department]/employees/[id]/access/actions.ts", "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const target = { exports: {} as { accessAction?: (state: object, form: FormData) => Promise<{ message?: string; error?: string }> } };
  runInNewContext(code, { module: target, exports: target.exports, require: (name: string) => name in mocks ? mocks[name] : require(name) });
  return { action: target.exports.accessAction!, prepare };
}

function form(organizationId = "labs") {
  const data = new FormData();
  for (const [key, value] of Object.entries({ intent: "prepare-staff", employmentId: "employment-1", organizationId, roleId: "role-1", scopeDecisionReference: "approved-scope-1" })) data.set(key, value);
  return data;
}

describe("HR reviewed staff appointment", () => {
  it("reuses the existing person for an authorized Labs developer draft", async () => {
    const { action, prepare } = loadAction();
    expect((await action({}, form())).message).toContain("inactive draft");
    expect(prepare).toHaveBeenCalledWith("boss-1", { organizationId: "labs", existingPersonId: "person-1", roleId: "role-1", scopeDecisionReference: "approved-scope-1" });
  });

  it("prepares a company-wide Administrative Officer for the existing employee", async () => {
    const { action, prepare } = loadAction({ targetId: "skillcity", brandId: null, roleName: "Administrative Officer" });
    expect((await action({}, form("skillcity"))).message).toContain("inactive draft");
    expect(prepare).toHaveBeenCalledWith("boss-1", { organizationId: "skillcity", existingPersonId: "person-1", roleId: "role-1", scopeDecisionReference: "approved-scope-1" });
  });

  it("rejects a forged organization, a different role, a linked account and inactive employment", async () => {
    for (const [options, data] of [
      [{}, form("other-company")],
      [{ roleName: "Division Director" }, form()],
      [{ account: { id: "existing-user" } }, form()],
      [{ employmentStatus: "DRAFT" }, form()]
    ] as const) {
      const { action, prepare } = loadAction(options);
      expect((await action({}, data)).error).toBeTruthy();
      expect(prepare).not.toHaveBeenCalled();
    }
  });
});
