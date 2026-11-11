import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { transpileModule, ModuleKind, JsxEmit } from "typescript";
import { describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

const nativeRequire = createRequire(import.meta.url);
class MockAccessError extends Error {}
function load(mocks: Record<string, unknown>) {
  const code = transpileModule(readFileSync("src/app/app/nicejobs/monthly-target-action.ts", "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const target = { exports: {} };
  runInNewContext(code, { module: target, exports: target.exports, require: (name: string) => name in mocks ? mocks[name] : nativeRequire(name) });
  return target.exports as { saveMonthlyEarningTargetAction: (state: object, form: FormData) => Promise<{ error?: string; message?: string }> };
}

function setup(saveMonthlyEarningTarget: (userId: string, value: unknown, onboarding: boolean) => Promise<unknown>) {
  const redirect = vi.fn((url: string) => { throw new Error(`Redirect ${url}`); });
  const action = load({
    "next/navigation": { redirect },
    "@/server/portals/request": { requestPortal: async () => ({ site: { id: "jobs" }, paths: { login: "/sites/jobs/login", signup: "/sites/jobs/signup" } }) },
    "@/server/portals/session": { getPortalSession: async () => ({ userId: "participant-1" }) },
    "@/server/nicejobs/candidate-about-you": { candidateAboutYou: { saveMonthlyEarningTarget } },
    "@/server/security/rate-limit": { consumeSecurityBudget: async () => {}, securityKey: () => "monthly-target-budget", RateLimitError: class extends Error {} },
    "@/server/authorization/engine": { AccessError: MockAccessError },
    "@/server/nicejobs/input": { NiceJobsError: class extends Error {} },
    "@/server/security/diagnostics": { safeDiagnostic: vi.fn() }
  });
  return { action: action.saveMonthlyEarningTargetAction, redirect };
}

describe("Nice Jobs monthly target action", () => {
  it("saves the onboarding target and continues to its guarded placeholder", async () => {
    const save = vi.fn(async () => 50000), { action, redirect } = setup(save), form = new FormData();
    form.set("mode", "ONBOARDING"); form.set("monthlyTarget", "50000");
    await expect(action({}, form)).rejects.toThrow("Redirect /sites/jobs/signup/target-complete");
    expect(save).toHaveBeenCalledWith("participant-1", "50000", true);
    expect(redirect).toHaveBeenCalledWith("/sites/jobs/signup/target-complete");
  });

  it("shows validation and authorization errors without navigating", async () => {
    const invalid = setup(async () => { throw new ZodError([]); });
    const form = new FormData(); form.set("mode", "ONBOARDING");
    expect(await invalid.action({}, form)).toEqual({ error: "Enter a whole rupee amount greater than zero." });
    const unauthorized = setup(async () => { throw new MockAccessError("Earlier steps incomplete"); });
    await expect(unauthorized.action({}, form)).resolves.toMatchObject({ error: expect.stringContaining("earlier Nice Jobs steps") });
  });

  it("allows participants to edit the amount later in My Profile", async () => {
    const save = vi.fn(async () => 12000), { action, redirect } = setup(save), form = new FormData();
    form.set("mode", "PROFILE"); form.set("monthlyTarget", "12000");
    await expect(action({}, form)).resolves.toEqual({ message: "Your monthly earning target has been updated." });
    expect(save).toHaveBeenCalledWith("participant-1", "12000", false);
    expect(redirect).not.toHaveBeenCalled();
  });
});
