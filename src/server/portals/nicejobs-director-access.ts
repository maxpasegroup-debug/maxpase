import { hasStaffWorkspaceCapabilities } from "@/server/skillcity/staff-roles";

export function isActiveNiceJobsDirectorIdentity(input: {
  personStatus: string | null | undefined;
  userStatus: string | null | undefined;
  emailVerifiedAt: Date | null | undefined;
  phoneVerifiedAt: Date | null | undefined;
  personMetadata: string | null | undefined;
}) {
  if (input.personStatus !== "ACTIVE" || input.userStatus !== "ACTIVE" || !input.emailVerifiedAt || !input.phoneVerifiedAt) return false;
  try {
    const metadata = JSON.parse(input.personMetadata ?? "{}");
    return metadata.authenticationRealm === "jobs" && metadata.identitySource === "HR_APPOINTMENT" && metadata.staffOnboarding === "ACTIVE";
  } catch {
    return false;
  }
}

export function hasActiveNiceJobsDirectorRole(input: {
  key: string;
  status: string;
  principalType: string;
  organizationId: string;
  permissions: readonly string[];
}, divisionId: string) {
  return input.key === "nicejobs-director" && input.status === "ACTIVE" && input.principalType === "HUMAN" && input.organizationId === divisionId && hasStaffWorkspaceCapabilities(input.key, input.permissions);
}
