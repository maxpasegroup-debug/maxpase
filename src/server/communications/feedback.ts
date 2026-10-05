export type CommunicationFeedback = { ok: boolean; outcome?: string; message: string };
export function resultFeedback(status: string): CommunicationFeedback {
  const messages: Record<string, string> = {
    APPROVAL_REQUIRED: "Preview prepared. Human approval and confirmation are still required; nothing was sent.",
    QUEUED: "Queued for processing. Delivery has not occurred.",
    PENDING: "Processing is incomplete. More work remains pending.",
    SIMULATED: "Simulated test result. No real delivery occurred.",
    ACCEPTED: "Provider accepted the message. Delivery is not yet verified.",
    SENT: "Message sent. Recipient delivery is not yet verified.",
    DELIVERED: "Provider confirmed delivery.",
    SUCCEEDED: "Processing completed.",
    FAILED: "Processing failed. Review the recorded failure before retrying.",
    REJECTED: "Operation rejected. No successful delivery is claimed.",
    UNKNOWN: "Delivery is uncertain. Reconcile the outcome; do not blindly retry.",
    BLOCKED: "Operation blocked by current authorization or policy. It was not completed.",
    NOT_CONFIGURED: "Settings saved. Real provider delivery is not configured.",
    CANCELLED: "Cancelled.",
    SAVED: "Saved."
  };
  const failure = ["FAILED", "REJECTED", "UNKNOWN", "BLOCKED"].includes(status);
  return { ok: !failure, outcome: status, message: messages[status] ?? "Result recorded: " + status };
}
export function batchFeedback(results: { status: string }[]): CommunicationFeedback {
  if (!results.length) return { ok: true, outcome: "NO_WORK", message: "No due work was found." };
  const counts = new Map<string, number>();
  for (const r of results) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
  const failed = results.filter(r => ["FAILED", "REJECTED", "UNKNOWN", "BLOCKED"].includes(r.status)).length;
  const pending = ["PENDING", "QUEUED", "PROCESSING", "SENDING", "ACCEPTED", "SENT"].some(status => counts.has(status));
  return { ok: failed === 0, outcome: failed ? failed === results.length ? "FAILED" : "PARTIAL" : pending ? "PENDING" : counts.has("SIMULATED") ? "SIMULATED" : "COMPLETED", message: [...counts].map(([status, count]) => `${count} ${status.toLowerCase()}`).join("; ") + (counts.has("SIMULATED") ? ". Simulated results are not real delivery." : "") + (counts.has("UNKNOWN") ? ". Uncertain delivery requires reconciliation." : "") + (counts.has("PENDING") ? ". More scan work remains; continue processing." : "") + (counts.has("ACCEPTED") || counts.has("SENT") ? ". Recipient delivery is not yet verified." : "") };
}
