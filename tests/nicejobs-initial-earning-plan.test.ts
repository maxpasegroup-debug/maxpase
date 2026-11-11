import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { transpileModule, ModuleKind, JsxEmit } from "typescript";
import { describe, expect, it, vi } from "vitest";
import { AccessError } from "@/server/authorization/engine";
import { requirePortalAccess } from "@/server/portals/policy";
import { createInitialEarningPlan, requiredQualifyingAdmissions } from "@/server/nicejobs/initial-earning-plan";
import type { InitialEarningPlan } from "@/server/nicejobs/initial-earning-plan";

vi.mock("@/server/portals/policy", () => ({ requirePortalAccess: vi.fn(async () => ({ divisionId: "career" })) }));

const nativeRequire = createRequire(import.meta.url);
const css = new Proxy({}, { get: (_target, key) => typeof key === "string" ? key : undefined });
function load<T>(path: string, mocks: Record<string, unknown>): T {
  const code = transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const target = { exports: {} };
  runInNewContext(code, { module: target, exports: target.exports, require: (name: string) => name in mocks ? mocks[name] : nativeRequire(name) });
  return target.exports as T;
}

const policyDefinition = (rule: object = { type: "ADMISSION_BONUS", perAdmissionMinor: "500000", milestoneEvery: 100, milestoneBonusMinor: "0" }) => ({
  name: "Approved PBA admission policy", divisionId: "startup", jobVersionId: "job-v1", frameworkVersionId: "framework-v1", currency: "INR", effectiveAt: "2026-01-01T00:00:00.000Z", metricKey: "ADMISSIONS", eligibility: { requireActive: false, minimumActual: "0", allowedStatuses: ["ON_TRACK"], excludedPipStatuses: [] }, rule, rounding: "HALF_UP", approvalControlPointId: "approval", settlementControlPointId: "settlement", settlement: { minimumMinor: "100", allowAdjustments: false }
});
const opportunity = {
  legalEmployer: { organizationId: "company", label: "AIRA Skill City Private Limited", legalName: "AIRA SKILL CITY PRIVATE LIMITED", status: "CONFIRMED", evidence: "approved record" },
  brandId: "brand-startup", brandLabel: "AIRA Startup School", divisionLabel: "AIRA Startup School", divisionStatus: "CONFIRMED", employmentType: "INDEPENDENT_PARTNER",
  partnerAgreement: { status: "CONFIRMED", version: "v1", evidence: "signed terms", text: "Approved partner terms" },
  referral: { status: "CONFIRMED", destination: "https://admissions.example/program", evidence: "reviewed referral destination" },
  programme: { id: "pba-program", commercialRecordId: "commercial", feeMinor: 100000, currency: "INR", taxBasisPoints: 0, paymentConditions: "Approved payment terms", refundRules: "Approved refund terms" },
  capacity: { admissionLimit: 100, participantLimit: 100, qualifyingPaymentMinor: "100", currency: "INR", evidence: "approved campaign capacity" },
  eligibility: "Suitable prospective students", compensation: { status: "NOT_APPLICABLE", text: null }, incentives: { status: "CONFIRMED", text: "Published incentive terms" },
  location: { status: "CONFIRMED", text: "Remote" }, workArrangement: "REMOTE", reportingManager: { personId: "manager-person", roleLabel: "Campaign lead" }
};

function fixture(options: { publicRecords?: boolean; policy?: object[] } = {}) {
  const db = {
    $transaction: async (work: (tx: object) => Promise<unknown>) => work(db),
    user: { findUnique: vi.fn(async () => ({ status: "ACTIVE", person: { status: "ACTIVE" } })) },
    organization: { findUnique: vi.fn(async () => ({ id: "company", status: "ACTIVE", company: { status: "ACTIVE" } })) },
    niceJobsVersion: { findFirst: vi.fn(async () => ({ id: "job-v1", configuration: JSON.stringify({ opportunity }), areas: [{ divisionId: "startup", division: { slug: "aira-startup-school" } }] })) },
    program: { findFirst: vi.fn(async () => ({ name: "PBA", capacity: 100 })) },
    niceJobsIncentiveVersion: { findMany: vi.fn(async () => options.policy ?? [{ number: 1, currency: "INR", definition: JSON.stringify(policyDefinition()), publishedAt: new Date("2026-01-01"), reviewedAt: new Date("2026-01-01"), policy: { name: "Approved PBA incentive", companyId: "company", divisionId: "startup", jobVersionId: "job-v1" } }]) }
  };
  const applications = { publicOpportunities: vi.fn(async () => ({ records: options.publicRecords === false ? [] : [{ id: "job-v1", code: "PBA", areas: [{ divisionId: "startup", division: { name: "AIRA Startup Skool" } }] }], nextCursor: null })) };
  const service = createInitialEarningPlan(db as never, applications as never, () => new Date("2026-11-10T00:00:00.000Z"));
  return { service, db, applications };
}

describe("NICEJOBS initial earning plan", () => {
  it("calculates qualifying admission counts accurately from approved admission rules", () => {
    expect(requiredQualifyingAdmissions(50000, { currency: "INR", rule: { type: "ADMISSION_BONUS", perAdmissionMinor: "500000", milestoneEvery: 100, milestoneBonusMinor: "0" }, rounding: "HALF_UP" })).toBe(10);
    expect(requiredQualifyingAdmissions(49000, { currency: "INR", rule: { type: "MARGINAL_MILESTONE", baseRateMinor: "500000", milestoneSize: 5, increment: { kind: "FIXED", amountMinor: "100000" } }, rounding: "HALF_UP" })).toBe(9);
    expect(requiredQualifyingAdmissions(50000, { currency: "USD", rule: { type: "ADMISSION_BONUS", perAdmissionMinor: "500000", milestoneEvery: 100, milestoneBonusMinor: "0" }, rounding: "HALF_UP" })).toBeNull();
  });

  it("shows campaign and incentive only for an active public campaign and active reviewed policy", async () => {
    const f = fixture();
    const result = await f.service.read("participant-1", 50000);
    expect(result).toMatchObject({ available: true, opportunityVersionId: "job-v1", programmeName: "PBA", programmeCapacity: 100, policy: { name: "Approved PBA incentive", perAdmissionMinor: "500000", currency: "INR", ruleType: "ADMISSION_BONUS", number: 1 }, qualifyingAdmissions: 10 });
    expect(f.applications.publicOpportunities).toHaveBeenCalledWith({ kind: "jobs", code: "PBA", limit: 50 });
  });

  it.each(["inactive campaign", "capacity exhausted campaign"])("fails closed when the candidate-facing campaign gate reports %s", async () => {
    const f = fixture({ publicRecords: false });
    expect(await f.service.read("participant-1", 50000)).toMatchObject({ available: false, policy: null, qualifyingAdmissions: null });
    expect(f.db.niceJobsIncentiveVersion.findMany).not.toHaveBeenCalled();
  });

  it("shows no incentive when an active campaign has no approved active policy", async () => {
    const f = fixture({ policy: [] });
    expect(await f.service.read("participant-1", 50000)).toMatchObject({ available: true, policy: null, qualifyingAdmissions: null });
  });

  it("requires authenticated participant access before reading campaign information", async () => {
    const f = fixture();
    vi.mocked(requirePortalAccess).mockRejectedValueOnce(new AccessError("Portal access denied"));
    await expect(f.service.read("non-participant", 50000)).rejects.toBeInstanceOf(AccessError);
    expect(f.applications.publicOpportunities).not.toHaveBeenCalled();
  });

  it("renders the saved target, campaign, estimate and non-guarantee disclosure", async () => {
    const JobsAuthShell = ({ title, description, children }: { title: string; description: string; children: ReactNode }) => createElement("main", null, createElement("h1", null, title), createElement("p", null, description), children);
    const read = vi.fn<() => Promise<InitialEarningPlan>>(async () => ({ available: true, opportunityVersionId: "job-v1", programmeName: "PBA", programmeCapacity: 100, policy: { name: "Approved PBA incentive", currency: "INR", perAdmissionMinor: "500000", ruleType: "ADMISSION_BONUS", number: 1 }, qualifyingAdmissions: 10 }));
    const { default: Page } = load<{ default: (props: { params: Promise<{ site: string }>; searchParams: Promise<{ error?: string }> }) => Promise<ReactNode> }>("src/app/sites/[site]/signup/target-complete/page.tsx", {
      "next/navigation": { notFound: () => { throw new Error("Not found"); }, redirect: (url: string) => { throw new Error(`Redirect ${url}`); } },
      "@/server/portals/request": { requestPortal: async () => ({ site: { id: "jobs" }, paths: { home: "/jobs", login: "/jobs/login", signup: "/jobs/signup", gateway: "/jobs/gateway" } }) },
      "@/server/portals/session": { getPortalSession: async () => ({ userId: "participant-1" }) },
      "@/server/nicejobs/candidate-about-you": { candidateAboutYou: { readOnboardingProgress: async () => ({ aboutYou: "STUDENT", ecosystemCompletedAt: "2026-01-01T00:00:00Z", monthlyTargetCompletedAt: "2026-01-01T00:00:00Z" }), readMonthlyEarningTarget: async () => 50000 } },
      "@/server/nicejobs/initial-earning-plan": { initialEarningPlan: { read } },
      "@/app/app/nicejobs/initial-earning-plan-action": { completeInitialEarningPlanAction: "#continue" },
      "@/app/sites/jobs-ui/auth-shell": { JobsAuthShell },
      "../initial-earning-plan.module.css": css
    });
    const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ site: "jobs" }), searchParams: Promise.resolve({}) }));
    expect(html).toContain("Your Initial Earning Plan");
    expect(html).toContain("₹50,000");
    expect(html).toContain("AIRA Startup School");
    expect(html).toContain("AIRA Skill City Private Limited");
    expect(html).toContain("₹5,000.00");
    expect(html).toContain("10");
    expect(html).toContain("Illustrative calculation — not a guaranteed income.");
    expect(html).toContain("Continue");
    read.mockResolvedValue({ available: true, opportunityVersionId: "job-v1", programmeName: "PBA", programmeCapacity: 100, policy: null, qualifyingAdmissions: null });
    const awaitingConfirmation = renderToStaticMarkup(await Page({ params: Promise.resolve({ site: "jobs" }), searchParams: Promise.resolve({}) }));
    expect(awaitingConfirmation).toContain("Incentive details will be shared after campaign confirmation.");
    expect(awaitingConfirmation).not.toContain("₹5,000.00");
  });

  it("shows availability update copy and never displays policy amounts when no campaign is available", async () => {
    const JobsAuthShell = ({ children }: { children: ReactNode }) => createElement("main", null, children);
    const { default: Page } = load<{ default: (props: { params: Promise<{ site: string }>; searchParams: Promise<{ error?: string }> }) => Promise<ReactNode> }>("src/app/sites/[site]/signup/target-complete/page.tsx", {
      "next/navigation": { notFound: () => { throw new Error("Not found"); }, redirect: (url: string) => { throw new Error(`Redirect ${url}`); } },
      "@/server/portals/request": { requestPortal: async () => ({ site: { id: "jobs" }, paths: { home: "/jobs", login: "/jobs/login", signup: "/jobs/signup", gateway: "/jobs/gateway" } }) },
      "@/server/portals/session": { getPortalSession: async () => ({ userId: "participant-1" }) },
      "@/server/nicejobs/candidate-about-you": { candidateAboutYou: { readOnboardingProgress: async () => ({ aboutYou: "STUDENT", ecosystemCompletedAt: "2026-01-01T00:00:00Z", monthlyTargetCompletedAt: "2026-01-01T00:00:00Z" }), readMonthlyEarningTarget: async () => 25000 } },
      "@/server/nicejobs/initial-earning-plan": { initialEarningPlan: { read: async () => ({ available: false, opportunityVersionId: null, programmeName: null, programmeCapacity: null, policy: null, qualifyingAdmissions: null }) } },
      "@/app/app/nicejobs/initial-earning-plan-action": { completeInitialEarningPlanAction: "#continue" },
      "@/app/sites/jobs-ui/auth-shell": { JobsAuthShell }, "../initial-earning-plan.module.css": css
    });
    const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ site: "jobs" }), searchParams: Promise.resolve({}) }));
    expect(html).toContain("Campaign availability is currently being updated.");
    expect(html).toContain("₹25,000");
    expect(html).not.toContain("Incentive details will be shared after campaign confirmation.");
    expect(html).not.toContain("₹5,000.00");
  });
});
