import { describe, expect, it, vi } from "vitest";
import { AccessError } from "@/server/authorization/engine";
import { aboutYouInput, createCandidateAboutYou, readAboutYouMetadata } from "@/server/nicejobs/candidate-about-you";

vi.mock("@/server/portals/policy", () => ({ requirePortalAccess: vi.fn(async () => ({ divisionId: "career" })) }));

function fixture(initial: Record<string, unknown> = { authenticationRealm: "jobs", legalAcceptance: { termsVersion: "v1" }, niceJobsVision: { outcome: "Learn" } }) {
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
  return { service: createCandidateAboutYou(client as never), db, metadata: () => metadata };
}

describe("Nice Jobs about-you profile", () => {
  it("validates only the six approved choices and reads saved values", () => {
    expect(aboutYouInput.parse("STUDENT")).toBe("STUDENT");
    expect(aboutYouInput.safeParse("UNEMPLOYED").success).toBe(false);
    expect(aboutYouInput.safeParse(undefined).success).toBe(false);
    expect(readAboutYouMetadata(JSON.stringify({ niceJobsAboutYou: "SELF_EMPLOYED" }))).toBe("SELF_EMPLOYED");
    expect(readAboutYouMetadata("bad json")).toBeNull();
  });

  it("saves to the signed-in participant profile, preserves other metadata, and reads the saved choice on return", async () => {
    const f = fixture();
    expect(await f.service.save("signed-in-user", "LOOKING_FOR_WORK")).toBe("LOOKING_FOR_WORK");
    expect(JSON.parse(f.metadata()!)).toMatchObject({ authenticationRealm: "jobs", legalAcceptance: { termsVersion: "v1" }, niceJobsVision: { outcome: "Learn" }, niceJobsAboutYou: "LOOKING_FOR_WORK" });
    expect(await f.service.read("signed-in-user")).toBe("LOOKING_FOR_WORK");
    expect(f.db.user.findUnique).toHaveBeenCalledWith({ where: { id: "signed-in-user" }, select: expect.any(Object) });
    expect(f.db.auditEvent.create).toHaveBeenCalledOnce();
    expect(f.db.auditEvent.create.mock.calls[0][0].data.action).toBe("nicejobs.profile.about_you.updated");
  });

  it("rejects missing or invalid choices before writing", async () => {
    const f = fixture();
    await expect(f.service.save("signed-in-user", undefined)).rejects.toThrow();
    await expect(f.service.save("signed-in-user", "NOT_AN_OPTION")).rejects.toThrow();
    expect(f.db.person.updateMany).not.toHaveBeenCalled();
    expect(f.db.auditEvent.create).not.toHaveBeenCalled();
  });

  it("does not update an inactive participant", async () => {
    const f = fixture();
    f.db.user.findUnique.mockResolvedValue({ status: "SUSPENDED", personId: "person-1", person: { status: "ACTIVE", metadata: f.metadata() } });
    await expect(f.service.save("signed-in-user", "STUDENT")).rejects.toBeInstanceOf(AccessError);
    expect(f.db.person.updateMany).not.toHaveBeenCalled();
  });

  it("detects a concurrent profile edit and avoids overwriting it", async () => {
    const f = fixture();
    f.db.person.updateMany.mockResolvedValue({ count: 0 });
    await expect(f.service.save("signed-in-user", "OTHER")).rejects.toThrow("Your profile changed");
    expect(f.db.auditEvent.create).not.toHaveBeenCalled();
  });

  it("tracks ecosystem onboarding completion without overwriting participant profile data", async () => {
    const f = fixture();
    await f.service.save("signed-in-user", "HOMEMAKER");
    const completedAt = await f.service.completeOpportunityEcosystem("signed-in-user");
    expect(Date.parse(completedAt)).not.toBeNaN();
    expect(await f.service.readOnboardingProgress("signed-in-user")).toEqual({ aboutYou: "HOMEMAKER", ecosystemCompletedAt: completedAt, monthlyTargetCompletedAt: null, initialEarningPlanCompletedAt: null });
    expect(JSON.parse(f.metadata()!)).toMatchObject({ authenticationRealm: "jobs", legalAcceptance: { termsVersion: "v1" }, niceJobsAboutYou: "HOMEMAKER", niceJobsOnboarding: { opportunityEcosystemCompletedAt: completedAt } });
    expect(await f.service.completeOpportunityEcosystem("signed-in-user")).toBe(completedAt);
    expect(f.db.auditEvent.create.mock.calls.filter(([args]) => args.data.action === "nicejobs.onboarding.opportunity_ecosystem.completed")).toHaveLength(1);
  });

  it("does not mark the ecosystem stage complete before the profile question is saved", async () => {
    const f = fixture({ authenticationRealm: "jobs" });
    await expect(f.service.completeOpportunityEcosystem("signed-in-user")).rejects.toThrow("Complete the profile question first");
    expect(f.db.person.updateMany).not.toHaveBeenCalled();
  });

  it("records initial-plan completion only after prior stages and target are saved", async () => {
    const f = fixture({ authenticationRealm: "jobs", niceJobsAboutYou: "STUDENT", niceJobsMonthlyEarningTarget: 50000, niceJobsOnboarding: { opportunityEcosystemCompletedAt: "2026-11-01T00:00:00.000Z", monthlyEarningTargetCompletedAt: "2026-11-02T00:00:00.000Z" } });
    const completedAt = await f.service.completeInitialEarningPlan("signed-in-user");
    expect(Date.parse(completedAt)).not.toBeNaN();
    expect(await f.service.readOnboardingProgress("signed-in-user")).toMatchObject({ aboutYou: "STUDENT", ecosystemCompletedAt: "2026-11-01T00:00:00.000Z", monthlyTargetCompletedAt: "2026-11-02T00:00:00.000Z", initialEarningPlanCompletedAt: completedAt });
    expect(JSON.parse(f.metadata()!)).toMatchObject({ niceJobsMonthlyEarningTarget: 50000, niceJobsOnboarding: { opportunityEcosystemCompletedAt: "2026-11-01T00:00:00.000Z", monthlyEarningTargetCompletedAt: "2026-11-02T00:00:00.000Z", initialEarningPlanCompletedAt: completedAt } });
    expect(await f.service.completeInitialEarningPlan("signed-in-user")).toBe(completedAt);
  });

  it("does not record initial-plan completion when a required onboarding stage is missing", async () => {
    const f = fixture({ authenticationRealm: "jobs", niceJobsAboutYou: "STUDENT", niceJobsMonthlyEarningTarget: 50000 });
    await expect(f.service.completeInitialEarningPlan("signed-in-user")).rejects.toThrow("Complete the earlier Nice Jobs onboarding steps first");
    expect(f.db.person.updateMany).not.toHaveBeenCalled();
  });
});
