import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { transpileModule, ModuleKind, JsxEmit } from "typescript";
import { describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

const nativeRequire = createRequire(import.meta.url);
function load<T>(mocks: Record<string, unknown>): T {
  const code = transpileModule(readFileSync("src/app/app/nicejobs/about-you-action.ts", "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const target = { exports: {} };
  runInNewContext(code, { module: target, exports: target.exports, require: (name: string) => name in mocks ? mocks[name] : nativeRequire(name) });
  return target.exports as T;
}

function setup(save: (userId: string, value: unknown) => Promise<unknown>) {
  const redirect = vi.fn((url: string) => { throw new Error(`Redirect ${url}`); });
  const action = load<{ saveAboutYou: (state: object, form: FormData) => Promise<{ message?: string; error?: string }> }>({
    "next/navigation": { redirect },
    "@/server/portals/request": { requestPortal: async () => ({ site: { id: "jobs" }, paths: { login: "/sites/jobs/login", signup: "/sites/jobs/signup" } }) },
    "@/server/portals/session": { getPortalSession: async () => ({ userId: "participant-1" }) },
    "@/server/nicejobs/candidate-about-you": { candidateAboutYou: { save } },
    "@/server/security/rate-limit": { consumeSecurityBudget: async () => {}, securityKey: () => "profile-budget", RateLimitError: class extends Error {} },
    "@/server/security/diagnostics": { safeDiagnostic: vi.fn() },
    "@/server/authorization/engine": { AccessError: class extends Error {} },
    "@/server/nicejobs/input": { NiceJobsError: class extends Error {} }
  });
  return { action: action.saveAboutYou, redirect };
}

describe("Nice Jobs about-you save action", () => {
  it("saves the selected value before continuing to the placeholder stage", async () => {
    const save = vi.fn(async () => "STUDENT"), { action, redirect } = setup(save), form = new FormData();
    form.set("mode", "ONBOARDING"); form.set("aboutYou", "STUDENT");
    await expect(action({}, form)).rejects.toThrow("Redirect /sites/jobs/signup/next");
    expect(save).toHaveBeenCalledWith("participant-1", "STUDENT");
    expect(redirect).toHaveBeenCalledWith("/sites/jobs/signup/next");
  });

  it("does not navigate when a required choice is missing or invalid", async () => {
    const save = vi.fn(async () => { throw new ZodError([]); }), { action, redirect } = setup(save), form = new FormData();
    form.set("mode", "ONBOARDING");
    expect(await action({}, form)).toEqual({ error: "Choose the option that best describes you." });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("keeps profile edits on the profile screen and confirms the save", async () => {
    const save = vi.fn(async () => "OTHER"), { action, redirect } = setup(save), form = new FormData();
    form.set("mode", "PROFILE"); form.set("aboutYou", "OTHER");
    expect(await action({}, form)).toEqual({ message: "Your profile has been updated." });
    expect(redirect).not.toHaveBeenCalled();
  });
});
