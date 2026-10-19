import { ojtConfiguration } from "./onboarding-input";
export function skillLevels(configuration: unknown, progress: { id: string; phase: string; key: string; status: string }[]) {
  const parsed = ojtConfiguration.safeParse(configuration);
  if (!parsed.success) return [];
  let previousComplete = true;
  return [...parsed.data.stages].sort((a, b) => a.order - b.order).map((stage, index) => {
    const required = stage.activities.filter(a => a.required);
    const sources = required.map(a => progress.find(p => p.phase === "OJT" && p.key === a.key && (a.reviewRequired ? p.status === "APPROVED" : ["APPROVED", "COMPLETED"].includes(p.status))));
    const unlocked = previousComplete && required.length > 0 && sources.every(Boolean);
    if (required.length) previousComplete = unlocked;
    return { key: stage.key, level: index + 1, title: stage.title, unlocked, skills: stage.activities.map(a => a.expectedOutcome), progressIds: sources.filter((p): p is NonNullable<typeof p> => !!p).map(p => p.id) };
  });
}
