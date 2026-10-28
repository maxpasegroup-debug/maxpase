// Deterministic presentation of already-authorized Startup Skool records.
// Stored applicant answers, evidence and community text are deliberately excluded.
export type StartupGuidance = {
  provider: "DETERMINISTIC_PORTAL_GUIDANCE";
  heading: string;
  fact: string;
  next: string;
  source: string;
  coverage: string;
  limitation: string;
};

type Application = { id: string; status: string } | null;
type FounderRow = { participantId: string; status: string; plan: null | { id: string; milestones: { key: string; submission: null | { status: string } }[] } };
type ManagedBatch = { id: string; plan: null | { status: string } };
type PendingEvidence = { id: string };
type ReviewApplication = { id: string; status: string };

const boundary = "Prepared from the records visible to you. No AI model was used. SIA cannot submit work, approve admission, accept evidence, change terms or grant access.";
function guidance(heading: string, fact: string, next: string, source: string, coverage: string): StartupGuidance {
  return { provider: "DETERMINISTIC_PORTAL_GUIDANCE", heading, fact, next, source, coverage, limitation: boundary };
}

export function applicantGuidance(application: Application): StartupGuidance {
  if (!application) return guidance("Begin your journey", "No application is recorded for this account.", "Answer the application questions and send them for human review when ready.", "ACCOUNT_APPLICATION", "OWN_APPLICATION");
  const source = `STARTUP_APPLICATION:${application.id}`;
  switch (application.status) {
    case "SUBMITTED": return guidance("Application received", "Your application is submitted.", "Wait for a human reviewer. Return here for a status update.", source, "OWN_APPLICATION");
    case "IN_REVIEW": return guidance("Review in progress", "An authorized person is reviewing your application.", "Check this page for the recorded decision. No payment or enrollment is required here.", source, "OWN_APPLICATION");
    case "APPROVED": return guidance("Decision recorded", "Your application has an approved admissions decision.", "Wait for separate programme terms and an authorized enrollment. Approval alone does not open learning access.", source, "OWN_APPLICATION");
    case "REJECTED": return guidance("Decision recorded", "This application was not approved.", "Contact the admissions team if you need clarification; SIA cannot reverse the decision.", source, "OWN_APPLICATION");
    default: return guidance("Status unavailable", "The application status cannot be summarized safely.", "Contact the admissions team.", source, "OWN_APPLICATION");
  }
}

export function founderGuidance(rows: FounderRow[]): StartupGuidance {
  const active = rows.find(row => row.status === "ACTIVE" && row.plan);
  if (!active?.plan) return guidance("Learning access pending", rows.length ? "An enrollment is recorded, but no active approved learning plan is available." : "No founder enrollment is recorded.", "Contact your programme coordinator if you expected access. An application decision does not create enrollment.", "STARTUP_ENROLLMENT", `OWN_ENROLLMENTS_FIRST_${rows.length}`);
  const milestones = active.plan.milestones;
  const awaiting = milestones.find(m => m.submission?.status === "SUBMITTED");
  const next = milestones.find((m, index) => (!m.submission || m.submission.status === "REWORK_REQUIRED") && (index === 0 || milestones[index - 1].submission?.status === "ACCEPTED"));
  const accepted = milestones.filter(m => m.submission?.status === "ACCEPTED").length;
  const fact = `${accepted} of ${milestones.length} milestones have accepted evidence${awaiting ? "; one submission is awaiting human review" : ""}.`;
  if (next) return guidance("Your next practice", fact, next.submission?.status === "REWORK_REQUIRED" ? "Read the mentor's feedback, improve your evidence and resubmit it yourself." : "Complete the next available practice and submit evidence for human review.", `STARTUP_FOUNDER_PLAN:${active.plan.id}`, `OWN_ACTIVE_ENROLLMENT_FIRST_${rows.length}`);
  if (awaiting) return guidance("Waiting for mentor review", fact, "Review your submitted work and check back for feedback. SIA does not accept evidence.", `STARTUP_FOUNDER_PLAN:${active.plan.id}`, `OWN_ACTIVE_ENROLLMENT_FIRST_${rows.length}`);
  return guidance("Milestones complete", fact, "Ask your programme team to confirm any next programme step. Completion is not a certificate or commercial outcome.", `STARTUP_FOUNDER_PLAN:${active.plan.id}`, `OWN_ACTIVE_ENROLLMENT_FIRST_${rows.length}`);
}

export function staffGuidance(batches: ManagedBatch[], evidence: PendingEvidence[], applications: ReviewApplication[]): StartupGuidance {
  const awaitingApplications = applications.filter(row => row.status === "SUBMITTED" || row.status === "IN_REVIEW").length;
  const draftPlans = batches.filter(row => row.plan?.status === "DRAFT").length;
  const fact = `${awaitingApplications} applications and ${evidence.length} evidence submissions are visible in the current review windows; ${draftPlans} batch plans are drafts.`;
  const next = evidence.length ? "Open the evidence queue, verify the learner's work and record your own feedback decision." : awaitingApplications ? "Open the applications queue and record a human admissions decision with a reason." : draftPlans ? "Review the draft plans against approved terms. A different authorized person must approve each plan." : "No review item is visible in these bounded windows. Check your programme queues for more records.";
  return guidance("Programme team briefing", fact, next, "STARTUP_DIVISION_REVIEW_QUEUES", `FIRST_${applications.length}_APPLICATIONS_FIRST_${evidence.length}_EVIDENCE_FIRST_${batches.length}_BATCHES`);
}

export function applicationQueueGuidance(applications: ReviewApplication[]): StartupGuidance {
  const awaiting = applications.filter(row => row.status === "SUBMITTED" || row.status === "IN_REVIEW").length;
  return guidance("Admissions review", `${awaiting} applications need a human decision in the first ${applications.length} visible records.`, awaiting ? "Review the applicant's answers and record your decision with a reason." : "No application needs a decision in this window. Check the queue later for new submissions.", "STARTUP_APPLICATION_REVIEW_QUEUE", `FIRST_${applications.length}_APPLICATIONS_ONLY`);
}
