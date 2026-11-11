import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { transpileModule, ModuleKind, JsxEmit } from "typescript";
import { describe, expect, it, vi } from "vitest";

const nativeRequire = createRequire(import.meta.url);
class MockAccessError extends Error {}
function setup(completeInitialEarningPlan: (userId: string) => Promise<unknown>) {
  const redirect = vi.fn((url: string) => { throw new Error(`Redirect ${url}`); });
  const code = transpileModule(readFileSync("src/app/app/nicejobs/initial-earning-plan-action.ts", "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const target = { exports: {} };
  runInNewContext(code, { module: target, exports: target.exports, require: (name: string) => name === "next/navigation" ? { redirect } : name === "@/server/portals/request" ? { requestPortal: async () => ({ site: { id: "jobs" }, paths: { login: "/jobs/login", signup: "/jobs/signup" } }) } : name === "@/server/portals/session" ? { getPortalSession: async () => ({ userId: "participant-1" }) } : name === "@/server/nicejobs/candidate-about-you" ? { candidateAboutYou: { completeInitialEarningPlan } } : name === "@/server/security/rate-limit" ? { consumeSecurityBudget: async () => {}, securityKey: () => "key", RateLimitError: class extends Error {} } : name === "@/server/authorization/engine" ? { AccessError: MockAccessError } : name === "@/server/nicejobs/input" ? { NiceJobsError: class extends Error {} } : name === "@/server/security/diagnostics" ? { safeDiagnostic: vi.fn() } : nativeRequire(name) });
  return { action: (target.exports as { completeInitialEarningPlanAction: () => Promise<void> }).completeInitialEarningPlanAction, redirect };
}

describe("Nice Jobs initial earning plan Continue", () => {
  it("records progress then goes to the guarded placeholder", async () => {
    const complete = vi.fn(async () => "2026-11-10T00:00:00.000Z"), { action, redirect } = setup(complete);
    await expect(action()).rejects.toThrow("Redirect /jobs/signup/plan-complete");
    expect(complete).toHaveBeenCalledWith("participant-1");
    expect(redirect).toHaveBeenCalledWith("/jobs/signup/plan-complete");
  });

  it("returns to the plan or retries safely when progress cannot be saved", async () => {
    const { action } = setup(async () => { throw new MockAccessError("Earlier steps incomplete"); });
    await expect(action()).rejects.toThrow("Redirect /jobs/signup/next-stage");
    const retry = setup(async () => { throw new Error("Temporary failure"); });
    await expect(retry.action()).rejects.toThrow("Redirect /jobs/signup/target-complete?error=retry");
  });
});
