export function workerEarningState(status: string, eligible: boolean) {
  if (!eligible) return "No payable earning — source or policy is not verified";
  switch (status) {
    case "CALCULATED": return "Calculated estimate — awaiting human verification";
    case "UNDER_REVIEW": return "Awaiting independent approval";
    case "APPROVED": return "Approved earning — awaiting wallet posting";
    case "POSTED": return "Earned and posted to wallet — payment unconfirmed";
    case "REJECTED": return "Rejected — no earning credited";
    case "VOIDED": return "Voided — no earning credited";
    default: return "No verified payout recorded";
  }
}
