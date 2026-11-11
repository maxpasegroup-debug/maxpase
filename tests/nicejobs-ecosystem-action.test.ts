import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { transpileModule, ModuleKind, JsxEmit } from "typescript";
import { describe, expect, it, vi } from "vitest";

const nativeRequire = createRequire(import.meta.url);
class MockAccessError extends Error {}
function load(mocks: Record<string, unknown>) {
  const code = transpileModule(readFileSync("src/app/app/nicejobs/ecosystem-action.ts", "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const target = { exports: {} };
  runInNewContext(code, { module: target, exports: target.exports, require: (name: string) => name in mocks ? mocks[name] : nativeRequire(name) });
  return target.exports as { completeOpportunityEcosystemAction: () => Promise<void> };
}

function setup(completeOpportunityEcosystem: () => Promise<unknown>) {
  const redirect = vi.fn((url: string) => { throw new Error(`Redirect ${url}`); });
  const action = load({
    "next/navigation": { redirect },
    "@/server/portals/request": { requestPortal: async () => ({ site: { id: "jobs" }, paths: { login: "/sites/jobs/login", signup: "/sites/jobs/signup" } }) },
    "@/server/portals/session": { getPortalSession: async () => ({ userId: "participant-1" }) },
    "@/server/nicejobs/candidate-about-you": { candidateAboutYou: { completeOpportunityEcosystem } },
    "@/server/security/rate-limit": { consumeSecurityBudget: async () => {}, securityKey: () => "ecosystem-budget", RateLimitError: class extends Error {} },
    "@/server/authorization/engine": { AccessError: MockAccessError },
    "@/server/nicejobs/input": { NiceJobsError: class extends Error {} },
    "@/server/security/diagnostics": { safeDiagnostic: vi.fn() }
  });
  return { action: action.completeOpportunityEcosystemAction, redirect, AccessError: MockAccessError };
}

describe("Nice Jobs opportunity ecosystem Continue action", () => {
  it("saves progress and navigates to the existing next-stage placeholder", async () => {
    const complete = vi.fn(async () => "2026-11-10T00:00:00.000Z"), { action, redirect } = setup(complete);
    await expect(action()).rejects.toThrow("Redirect /sites/jobs/signup/next-stage");
    expect(complete).toHaveBeenCalledWith("participant-1");
    expect(redirect).toHaveBeenCalledWith("/sites/jobs/signup/next-stage");
  });

  it("returns to About You if the participant has not completed that required step", async () => {
    const { action } = setup(async () => { throw new MockAccessError("Missing profile"); });
    await expect(action()).rejects.toThrow("Redirect /sites/jobs/signup/about-you");
  });
});
