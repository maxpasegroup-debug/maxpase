import type { z } from "zod";
import type { ojtConfiguration } from "./onboarding-input";
import { curriculumSchedule } from "./curriculum";

type Ojt = z.infer<typeof ojtConfiguration>;
type Progress = { phase: string; key: string; status: string };
const complete = (status: string) => ["COMPLETED", "APPROVED"].includes(status);

export function learningSummary(ojt: Ojt | null | undefined, rows: Progress[], startedAt: Date | null, now: Date) {
  const dates=startedAt && ojt?.curriculum ? curriculumSchedule(ojt,startedAt) : null;
  const elapsedDay = dates ? dates.filter(d=>d.startsAt<=now).length : startedAt ? Math.max(1, Math.floor((now.getTime() - startedAt.getTime()) / 86400000) + 1) : null;
  return {
    configured: !!ojt, elapsedDay, durationDays: ojt?.durationDays ?? null, dayMode:ojt?.curriculum?.dayMode??null, timezone:ojt?.curriculum?.timezone??"UTC",
    milestones: [...(ojt?.stages ?? [])].sort((a, b) => a.order - b.order).map(stage => {
      const required = stage.activities.filter(a => a.required);
      const completed = required.filter(a => rows.some(r => r.phase === "OJT" && r.key === a.key && (a.reviewRequired?r.status==="APPROVED":complete(r.status)))).length;
      return { key: stage.key, title: stage.title, required: required.length, completed, status: !required.length ? "OPTIONAL" : completed === required.length ? "COMPLETED" : "IN_PROGRESS" };
    }),
  };
}
