"use client";
import { useActionState, type ReactNode } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { applicationAction, type ApplicationActionState } from "./application-actions";

export type InterviewQuestion = { key: string; question: string; type: string; required: boolean; order: number; weight: number; active: boolean; options?: string[] };
export function RecruitmentCommand({ realm, command, label, children, questions = [] }: { realm: string; command: Record<string, unknown>; label: string; children?: ReactNode; questions?: InterviewQuestion[] }) {
  const [state, action, pending] = useActionState(async (previous: ApplicationActionState, form: FormData) => {
    const payload = { ...command };
    for (const key of ["reason", "location", "instructions", "candidateMessage", "recommendation", "approvalId", "decision"]) if (form.get(key)) payload[key] = form.get(key);
    if (form.get("scheduledAt")) payload.scheduledAt = String(form.get("scheduledAt")) + ":00.000Z";
    if (form.has("interviewerIds")) payload.interviewerIds = form.getAll("interviewerIds");
    if (questions.length) {
      const answers: Record<string, unknown> = {}, scores: Record<string, number> = {};
      for (const q of questions.filter(q => q.active)) {
        const value = form.get("answer:" + q.key);
        if (value !== null && value !== "") answers[q.key] = q.type === "MULTI_SELECT" ? form.getAll("answer:" + q.key) : q.type === "RATING" ? Number(value) : q.type === "YES_NO" ? value === "true" : value;
        if (form.get("score:" + q.key) !== null && form.get("score:" + q.key) !== "") scores[q.key] = Number(form.get("score:" + q.key));
      }
      payload.answers = answers; payload.scores = scores;
    }
    if (form.has("content:terms")) payload.content = Object.fromEntries(["startDate", "compensation", "incentives", "expectations", "terms"].map(key => [key, form.get("content:" + key) || null]));
    form.set("operation", "RECRUITMENT"); form.set("realm", realm); form.set("command", JSON.stringify(payload));
    return applicationAction(previous, form);
  }, {} as ApplicationActionState);
  return <form action={action} className="nj-form" onSubmit={e => { if (!window.confirm(label + "?")) e.preventDefault(); }}><fieldset disabled={pending || !!state.success}>{children}
    {questions.filter(q => q.active).sort((a, b) => a.order - b.order).map(q => <fieldset key={q.key}><legend>{q.question}</legend>{["SINGLE_SELECT", "MULTI_SELECT", "YES_NO"].includes(q.type) ? <select name={"answer:" + q.key} required={q.required} multiple={q.type === "MULTI_SELECT"}><option value="">Select</option>{q.type === "YES_NO" ? <><option value="true">Yes</option><option value="false">No</option></> : q.options?.map(o => <option key={o}>{o}</option>)}</select> : q.type === "RATING" ? <input aria-label={q.question} name={"answer:" + q.key} type="number" min={0} max={10} required={q.required} /> : <textarea aria-label={q.question} name={"answer:" + q.key} required={q.required} maxLength={4000} />}<label>Score (0-10)<input name={"score:" + q.key} type="number" min={0} max={10} step="any" required={q.required} /></label></fieldset>)}
    <button className="button" disabled={pending || !!state.success} type="submit">{pending ? <LoaderCircle size={16} /> : <Check size={16} />}{pending ? "Saving" : label}</button></fieldset>{state.error && <p role="alert">{state.error}</p>}{state.success && <p role="status">{state.success}</p>}</form>;
}
