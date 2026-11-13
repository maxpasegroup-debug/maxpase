import { describe, expect, it } from "vitest";
import { hasActiveNiceJobsDirectorRole, isActiveNiceJobsDirectorIdentity } from "@/server/portals/nicejobs-director-access";

const activeIdentity = {
  personStatus: "ACTIVE",
  userStatus: "ACTIVE",
  emailVerifiedAt: new Date(),
  phoneVerifiedAt: new Date(),
  personMetadata: JSON.stringify({ authenticationRealm: "jobs", identitySource: "HR_APPOINTMENT", staffOnboarding: "ACTIVE" })
};
const role = {
  key: "nicejobs-director",
  status: "ACTIVE",
  principalType: "HUMAN",
  organizationId: "career-hub",
  permissions: ["organization.read", "nicejobs.command.read", "nicejobs.job.read", "nicejobs.knowledge.read", "nicejobs.knowledge.manage", "nicejobs.workspace.read"]
};

describe("NICEJOBS Director portal access", () => {
  it("requires active person and account, verified email and phone, and completed HR onboarding", () => {
    expect(isActiveNiceJobsDirectorIdentity(activeIdentity)).toBe(true);
    expect(isActiveNiceJobsDirectorIdentity({ ...activeIdentity, phoneVerifiedAt: null })).toBe(false);
    expect(isActiveNiceJobsDirectorIdentity({ ...activeIdentity, emailVerifiedAt: null })).toBe(false);
    expect(isActiveNiceJobsDirectorIdentity({ ...activeIdentity, userStatus: "INACTIVE" })).toBe(false);
    expect(isActiveNiceJobsDirectorIdentity({ ...activeIdentity, personMetadata: "{}" })).toBe(false);
    expect(isActiveNiceJobsDirectorIdentity({ ...activeIdentity, personMetadata: "invalid" })).toBe(false);
  });

  it("requires the active, human NICEJOBS Director role with its scoped capabilities", () => {
    expect(hasActiveNiceJobsDirectorRole(role, "career-hub")).toBe(true);
    expect(hasActiveNiceJobsDirectorRole({ ...role, status: "SUSPENDED" }, "career-hub")).toBe(false);
    expect(hasActiveNiceJobsDirectorRole({ ...role, principalType: "SERVICE" }, "career-hub")).toBe(false);
    expect(hasActiveNiceJobsDirectorRole({ ...role, organizationId: "another-division" }, "career-hub")).toBe(false);
    expect(hasActiveNiceJobsDirectorRole({ ...role, permissions: ["organization.read"] }, "career-hub")).toBe(false);
  });
});
