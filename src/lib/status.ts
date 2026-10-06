export function statusTone(value: string) {
  const state = value.toUpperCase().replaceAll(" ", "_");
  if (["FAILED", "FAILURE", "CRITICAL", "REJECTED", "BLOCKED", "OFF_TRACK"].some(s => state.includes(s))) return "danger";
  if (["AT_RISK", "OVERDUE", "LIMITED_COVERAGE", "WARNING"].some(s => state.includes(s))) return "warning";
  if (["ACTIVE", "APPROVED", "COMPLETED", "ACHIEVED", "SUCCEEDED", "SUCCESS"].includes(state)) return "success";
  if (["PENDING", "IN_PROGRESS", "PROCESSING", "SUBMITTED"].includes(state)) return "info";
  return "neutral";
}
