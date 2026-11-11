import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { transpileModule, ModuleKind, JsxEmit } from "typescript";
import { describe, expect, it, vi } from "vitest";
import { AccessError } from "@/server/authorization/engine";
import { requirePortalAccess } from "@/server/portals/policy";
import { createCandidateAboutYou, monthlyEarningTargetInput } from "@/server/nicejobs/candidate-about-you";

vi.mock("@/server/portals/policy", () => ({ requirePortalAccess: vi.fn(async () => ({ divisionId: "career" })) }));

const nativeRequire = createRequire(import.meta.url);
function load<T>(path: string, mocks: Record<string, unknown>): T {
  const code = transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const target = { exports: {} };
  runInNewContext(code, { module: target, exports: target.exports, require: (name: string) => name in mocks ? mocks[name] : nativeRequire(name) });
  return target.exports as T;
}

function fixture(initial: Record<string, unknown> = { authenticationRealm: "jobs", legalAcceptance: { termsVersion: "v1" }, niceJobsAboutYou: "STUDENT", niceJobsVision: { outcome: "Learn" }, niceJobsOnboarding: { opportunityEcosystemCompletedAt: "2026-11-01T00:00:00.000Z" } }) {
  let metadata: string | null = JSON.stringify(initial);
  const db = {
    user: { findUnique: vi.fn(async () => ({ status: "ACTIVE", personId: "person-1", person: { status: "ACTIVE", metadata } })) },
    person: { updateMany: vi.fn(async (args: { where: { id: string; metadata: string | null }; data: { metadata: string } }) => {
      if (args.where.id !== "person-1" || args.where.metadata !== metadata) return { count: 0 };
      metadata = args.data.metadata; return { count: 1 };
    }) },
    auditEvent: { create: vi.fn(async (_args: { data: { action: string } }) => ({})) }
  };
  const client = { $transaction: async (operation: (tx: typeof db) => Promise<unknown>) => operation(db) };
  return { service: createCandidateAboutYou(client as never, () => new Date("2026-11-10T00:00:00.000Z")), db, metadata: () => metadata };
}

describe("Nice Jobs monthly earning target", () => {
  it("accepts positive whole rupee amounts without forcing the suggested benchmark", () => {
    expect(monthlyEarningTargetInput.parse("50000")).toBe(50000);
    expect(monthlyEarningTargetInput.parse("1000")).toBe(1000);
    for (const invalid of ["", "0", "-1", "1.5", "1e4", "abc", "9007199254740992"]) expect(monthlyEarningTargetInput.safeParse(invalid).success).toBe(false);
  });

  it("saves and restores onboarding target and completion while preserving profile data", async () => {
    const f = fixture();
    expect(await f.service.saveMonthlyEarningTarget("participant-1", "50000", true)).toBe(50000);
    expect(await f.service.readMonthlyEarningTarget("participant-1")).toBe(50000);
    expect(await f.service.readOnboardingProgress("participant-1")).toEqual({ aboutYou: "STUDENT", ecosystemCompletedAt: "2026-11-01T00:00:00.000Z", monthlyTargetCompletedAt: "2026-11-10T00:00:00.000Z", initialEarningPlanCompletedAt: null });
    expect(JSON.parse(f.metadata()!)).toMatchObject({ authenticationRealm: "jobs", legalAcceptance: { termsVersion: "v1" }, niceJobsAboutYou: "STUDENT", niceJobsVision: { outcome: "Learn" }, niceJobsMonthlyEarningTarget: 50000 });
    expect(f.db.auditEvent.create.mock.calls[0][0].data.action).toBe("nicejobs.onboarding.monthly_earning_target.completed");
  });

  it("allows later profile edits and preserves the onboarding completion record", async () => {
    const f = fixture();
    await f.service.saveMonthlyEarningTarget("participant-1", 50000, true);
    expect(await f.service.saveMonthlyEarningTarget("participant-1", "12000", false)).toBe(12000);
    expect(await f.service.readMonthlyEarningTarget("participant-1")).toBe(12000);
    expect(JSON.parse(f.metadata()!).niceJobsOnboarding.monthlyEarningTargetCompletedAt).toBe("2026-11-10T00:00:00.000Z");
    expect(f.db.auditEvent.create.mock.calls[1][0].data.action).toBe("nicejobs.profile.monthly_earning_target.updated");
  });

  it("rejects invalid amounts, missing earlier onboarding, inactive users and concurrent edits", async () => {
    const f = fixture();
    await expect(f.service.saveMonthlyEarningTarget("participant-1", "0", true)).rejects.toThrow();
    const incomplete = fixture({ authenticationRealm: "jobs", niceJobsAboutYou: "STUDENT" });
    await expect(incomplete.service.saveMonthlyEarningTarget("participant-1", "1000", true)).rejects.toThrow("Complete the earlier Nice Jobs onboarding steps first");
    f.db.user.findUnique.mockResolvedValue({ status: "SUSPENDED", personId: "person-1", person: { status: "ACTIVE", metadata: f.metadata() } });
    await expect(f.service.readMonthlyEarningTarget("participant-1")).rejects.toBeInstanceOf(AccessError);
    const concurrent = fixture();
    concurrent.db.person.updateMany.mockResolvedValue({ count: 0 });
    await expect(concurrent.service.saveMonthlyEarningTarget("participant-1", "2000", true)).rejects.toThrow("Your profile changed");
  });

  it("requires authorized NICEJOBS participant access before reading or writing", async () => {
    const f = fixture();
    vi.mocked(requirePortalAccess).mockRejectedValueOnce(new AccessError("Portal access denied"));
    await expect(f.service.readMonthlyEarningTarget("non-participant")).rejects.toBeInstanceOf(AccessError);
    vi.mocked(requirePortalAccess).mockRejectedValueOnce(new AccessError("Portal access denied"));
    await expect(f.service.saveMonthlyEarningTarget("non-participant", "50000", false)).rejects.toBeInstanceOf(AccessError);
    expect(f.db.person.updateMany).not.toHaveBeenCalled();
  });

  it("restores the saved value on the guarded onboarding screen and protects its prerequisites", async () => {
    const readMonthlyEarningTarget = vi.fn(async () => 72500);
    const readOnboardingProgress = vi.fn<() => Promise<{ aboutYou: string | null; ecosystemCompletedAt: string | null; monthlyTargetCompletedAt: string | null; initialEarningPlanCompletedAt: string | null }>>(async () => ({ aboutYou: "STUDENT", ecosystemCompletedAt: "2026-11-01T00:00:00Z", monthlyTargetCompletedAt: null, initialEarningPlanCompletedAt: null }));
    const JobsAuthShell = ({ title, description, children }: { title: string; description: string; children: ReactNode }) => createElement("main", null, createElement("h1", null, title), createElement("p", null, description), children);
    const MonthlyTargetForm = ({ initial, mode }: { initial: number | null; mode: string }) => createElement("form", { "data-target": initial, "data-mode": mode });
    const { default: Page } = load<{ default: (props: { params: Promise<{ site: string }> }) => Promise<ReactNode> }>("src/app/sites/[site]/signup/next-stage/page.tsx", {
      "next/navigation": { notFound: () => { throw new Error("Not found"); }, redirect: (url: string) => { throw new Error(`Redirect ${url}`); } },
      "@/server/portals/request": { requestPortal: async () => ({ site: { id: "jobs" }, paths: { home: "/jobs", login: "/jobs/login", signup: "/jobs/signup" } }) },
      "@/server/portals/session": { getPortalSession: async () => ({ userId: "participant-1" }) },
      "@/server/nicejobs/candidate-about-you": { candidateAboutYou: { readOnboardingProgress, readMonthlyEarningTarget } },
      "@/app/sites/jobs-ui/auth-shell": { JobsAuthShell },
      "@/app/app/nicejobs/monthly-target-form": { MonthlyTargetForm }
    });
    const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ site: "jobs" }) }));
    expect(html).toContain("What is your monthly earning target?");
    expect(html).toContain("Tell us how much you would like to earn through NICEJOBS opportunities.");
    expect(html).toContain('data-target="72500"');
    expect(html).toContain('data-mode="ONBOARDING"');
    await expect(Page({ params: Promise.resolve({ site: "jobs" }) })).resolves.toBeTruthy();
    expect(readMonthlyEarningTarget).toHaveBeenCalledWith("participant-1");
    readOnboardingProgress.mockResolvedValue({ aboutYou: null, ecosystemCompletedAt: null, monthlyTargetCompletedAt: null, initialEarningPlanCompletedAt: null });
    await expect(Page({ params: Promise.resolve({ site: "jobs" }) })).rejects.toThrow("Redirect /jobs/signup/about-you");
  });

  it("offers the optional ₹50,000 benchmark and remains a compact mobile layout", () => {
    const css = readFileSync("src/app/app/nicejobs/monthly-target.module.css", "utf8");
    const component = readFileSync("src/app/app/nicejobs/monthly-target-form.tsx", "utf8");
    expect(component).toContain("setAmount(\"50000\")");
    expect(component).toContain("Suggested planning benchmark");
    expect(component).toContain("not a promise or guarantee of earnings");
    expect(css).toContain("width: 100%");
  });
});
