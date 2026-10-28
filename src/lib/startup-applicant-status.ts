export function applicationStatusSteps(status: string) {
  if (!["SUBMITTED", "IN_REVIEW", "APPROVED", "REJECTED"].includes(status)) return null;
  const step = status === "SUBMITTED" ? 0 : status === "IN_REVIEW" ? 1 : 2;
  return ["Application received", "Human review", "Decision recorded"].map((label, index) => ({
    label,
    number: index + 1,
    state: index < step ? "complete" : index === step ? "current" : "waiting",
    detail: index === 2 && step === 2 ? status === "APPROVED" ? "Approved for the next admissions step; not enrolled" : "Not approved for this intake" : index < step ? "Recorded" : index === step ? "Current step" : "Not yet recorded"
  }));
}
