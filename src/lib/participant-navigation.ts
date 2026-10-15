export const participantSections = [
  ["my-day", "Today"], ["my-onboarding", "Training"], ["my-work", "Work"],
  ["worker-reports", "Reports"], ["worker-wallet", "Wallet"],
  ["worker-resources", "Resources"], ["worker-help", "Help"],
] as const;

export function participantEntry(worker: boolean, trainingAllowed: boolean, view?: string) {
  if (worker || !trainingAllowed) return null;
  if (!view || view === "my-day") return "TRAINING";
  return ["my-work", "worker-reports", "worker-wallet", "worker-resources", "worker-help"].includes(view) ? "PENDING" : null;
}

export function participantSection(view: string) {
  if (["my-onboarding", "worker-training"].includes(view)) return "my-onboarding";
  if (["my-work", "my-leads", "my-followups", "lead-detail", "work-sops"].includes(view)) return "my-work";
  if (view === "worker-reports" || view.startsWith("worker-performance") || view.startsWith("worker-pip")) return "worker-reports";
  if (["worker-wallet", "worker-incentives", "worker-incentive-detail", "worker-statements", "worker-statement", "worker-payouts"].includes(view)) return "worker-wallet";
  if (["worker-resources", "worker-sops", "knowledge-detail"].includes(view)) return "worker-resources";
  if (["worker-help", "worker-sia", "worker-profile", "worker-messages"].includes(view)) return "worker-help";
  return "my-day";
}

export const participantViews = [...participantSections.map(([view]) => view), "worker-training", "worker-sia", "worker-profile", "worker-sops", "worker-messages", "knowledge-detail", "my-leads", "my-followups", "lead-detail", "work-sops", "worker-performance", "worker-pip"];
