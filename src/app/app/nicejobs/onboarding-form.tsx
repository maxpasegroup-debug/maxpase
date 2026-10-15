"use client";
import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import type { FormConfiguration, Answers } from "@/server/nicejobs/application-configuration";
import { matches } from "@/server/nicejobs/application-configuration";
import { applicationAction, type ApplicationActionState } from "./application-actions";

export function OnboardingCommand({ realm, own, command, label, form, evidence, management, review, readiness, assessment, assign, reviewers = [], report, trainingControl, controlDecision, reminder, programmeVersions=[] }: { realm: string; own: boolean; command: Record<string, unknown>; label: string; form?: FormConfiguration | null; evidence?: boolean; management?: boolean; review?: boolean; readiness?: boolean; assessment?: boolean; assign?: "OJT" | "READINESS"; reviewers?: { id: string; name: string }[]; report?:{date:string;previousId?:string}; trainingControl?:"PAUSE"|"RESUME"|"EXTEND"|"PROGRAMME_CHANGE"; controlDecision?:boolean; reminder?:boolean;programmeVersions?:{id:string;title:string;number:number}[] }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Answers>({});
  const [outcome,setOutcome]=useState("");
  const [state, action, pending] = useActionState(async (s: ApplicationActionState, fields: FormData) => {
    const data: Record<string, unknown> = { ...command };
    for(const key of [...(trainingControl==="EXTEND"?["dueAt"]:[]),...(reminder?["remindAt"]:[])])if(!Number.isFinite(new Date(String(fields.get(key))).getTime()))return {error:"Choose a valid date and time."};
    if (form) data.answers = Object.fromEntries(form.fields.filter(f => !f.when || matches(f.when, answers)).filter(f => answers[f.key] !== undefined).map(f => [f.key, answers[f.key]]));
    else if (!management && !["ENROLL", "START_ORIENTATION", "FINISH_ORIENTATION", "START_OJT", "REQUEST_READINESS", "DAILY_REPORT"].includes(String(command.operation)) && !evidence) data.acknowledged = true;
    if(report)data.report={date:report.date,notes:fields.get("notes"),blocker:fields.get("blocker"),nextPractice:fields.get("nextPractice"),...(report.previousId?{supersedesSubmissionId:report.previousId,correctionReason:fields.get("correctionReason")}: {})};
    if (evidence) data.evidence = { text: String(fields.get("evidence") ?? "") };
    if (management) { data.reason = fields.get("reason"); if (fields.get("feedback")) data.feedback = fields.get("feedback"); }
    if (review || readiness) data.outcome = fields.get("outcome");
    if (assign) { data.reviewerUserId = fields.get("reviewerUserId"); data.reviewerKind = assign; }
    if(trainingControl)data.control={kind:trainingControl,...(trainingControl==="EXTEND"?{progressId:command.progressId,dueAt:new Date(String(fields.get("dueAt"))).toISOString()}:trainingControl==="PROGRAMME_CHANGE"?{versionId:fields.get("targetVersionId")}:{})};
    if(trainingControl==="EXTEND")delete data.progressId;
    if(controlDecision)data.controlDecision={proposalId:command.proposalId,decision:fields.get("controlDecision")};
    if(controlDecision)delete data.proposalId;
    if(reminder)data.reminder={recipient:fields.get("recipient"),remindAt:new Date(String(fields.get("remindAt"))).toISOString(),message:fields.get("message")};
    fields.set("operation", "ONBOARDING"); fields.set("command", JSON.stringify(data)); fields.set("own", String(own));
    const result = await applicationAction(s, fields); if (result.success) router.refresh(); return result;
  }, {});
  return <form action={action} className="nj-form"><input type="hidden" name="realm" value={realm} />
    {form?.fields.filter(f => !f.when || matches(f.when, answers)).map(f => <label key={f.key}>{f.label}{f.required ? " *" : ""}{f.type === "SELECT" || f.type === "BOOLEAN" ? <select required={f.required} value={String(answers[f.key] ?? "")} onChange={e => setAnswers({ ...answers, [f.key]: f.type === "BOOLEAN" ? e.target.value === "true" : e.target.value })}><option value="">Select</option>{(f.type === "BOOLEAN" ? ["true", "false"] : f.options ?? []).map(o => <option key={o}>{o}</option>)}</select> : f.type === "MULTI_SELECT" ? <select multiple required={f.required} value={Array.isArray(answers[f.key]) ? answers[f.key] as string[] : []} onChange={e => setAnswers({ ...answers, [f.key]: Array.from(e.target.selectedOptions).map(o => o.value) })}>{f.options?.map(o => <option key={o}>{o}</option>)}</select> : <input required={f.required} type={f.type === "NUMBER" ? "number" : f.type === "DATE" ? "date" : f.type === "EMAIL" ? "email" : "text"} maxLength={4000} value={String(answers[f.key] ?? "")} onChange={e => setAnswers({ ...answers, [f.key]: f.type === "NUMBER" && e.target.value !== "" ? Number(e.target.value) : e.target.value })} />}</label>)}
    {evidence && <label>Practice evidence<textarea name="evidence" required maxLength={4000} /></label>}
    {trainingControl==="EXTEND" && <label>New deadline (device local time)<input name="dueAt" type="datetime-local" required/></label>}
    {trainingControl==="PROGRAMME_CHANGE" && <label>Approved target programme<select name="targetVersionId" required><option value="">Select a reviewed version</option>{programmeVersions.map(v=><option key={v.id} value={v.id}>{v.title} / v{v.number}</option>)}</select></label>}
    {controlDecision && <label>Independent decision<select name="controlDecision" required><option value="">Select</option><option value="APPROVED">Approve</option><option value="REJECTED">Reject</option></select></label>}
    {reminder && <><label>Recipient<select name="recipient" required><option value="CANDIDATE">Participant</option><option value="OJT_REVIEWER">Assigned trainer</option><option value="READINESS_REVIEWER">Assigned readiness reviewer</option></select></label><label>Reminder time (device local time)<input name="remindAt" type="datetime-local" required/></label><label>Internal reminder message<textarea name="message" required maxLength={1000}/></label></>}
    {(trainingControl || controlDecision) && <label>Participant-visible guidance<textarea name="feedback" required maxLength={1000}/></label>}
    {report && <><p>Report date: {report.date}</p><label>What did you learn or practise?<textarea name="notes" required maxLength={4000}/></label><label>Where do you need help?<textarea name="blocker" maxLength={2000}/></label><label>Next practice<textarea name="nextPractice" maxLength={2000}/></label>{report.previousId && <label>Correction reason<textarea name="correctionReason" required maxLength={1000}/></label>}</>}
    {assign && <label>Reviewer<select name="reviewerUserId" required><option value="">Select an authorized reviewer</option>{reviewers.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>}
    {(review || readiness) && <label>Decision<select name="outcome" required onChange={e=>setOutcome(e.target.value)}><option value="">Select</option>{(readiness ? ["READY", "NOT_READY", "NEEDS_REVIEW"] : assessment ? ["PASS", "FAIL", "NEEDS_REVIEW"] : ["APPROVED", "REWORK_REQUIRED", "REJECTED"]).map(o => <option key={o} value={o}>{o.replaceAll("_", " ")}</option>)}</select></label>}
    {management && <><label>Private decision reason<textarea name="reason" required maxLength={1000} /></label>{(review || readiness) && <label>Feedback / rework instructions<textarea name="feedback" required={review && ["REWORK_REQUIRED","REJECTED","FAIL","NEEDS_REVIEW"].includes(outcome)} maxLength={1000} /></label>}</>}
    <label><input type="checkbox" required disabled={pending || !!state.success} /> Confirm {label.toLowerCase()}</label>
    <button className="button" disabled={pending || !!state.success}>{pending ? "Saving..." : label}</button>{state.error && <p role="alert">{state.error}</p>}{state.success && <p role="status">{state.success}</p>}
  </form>;
}
