import { z } from "zod";

const account = z.string().trim().min(1).max(200).nullable();
const evidence = z.string().trim().max(1000).nullable();
export const programmeConfiguration = z.object({
  managerUserId: account,
  publicationReviewerUserId: account,
  ojtReviewerUserId: account,
  readinessReviewerUserId: account,
  engagementApproval: evidence,
  compensationApproval: evidence,
  policyApproval: evidence,
  trainingOutcomes: z.string().trim().max(4000)
}).strict();
export type ProgrammeConfiguration = z.infer<typeof programmeConfiguration>;
export const emptyProgramme: ProgrammeConfiguration = {
  managerUserId: null, publicationReviewerUserId: null, ojtReviewerUserId: null, readinessReviewerUserId: null,
  engagementApproval: null, compensationApproval: null, policyApproval: null, trainingOutcomes: ""
};

// Catalogue identities cannot opt out by clearing configuration or changing audience.
export function requiresProgramme(code: string, configuration: { programmeSetup?: unknown } | null) {
  return ["JOB-001", "JOB-BAM", "JOB-DCM"].includes(code) || !!configuration?.programmeSetup;
}
