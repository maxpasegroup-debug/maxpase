"use client";
import { useActionState } from "react";
import { pilotFeedbackDecisionAction, pilotFeedbackSubmitAction, type PilotFeedbackState } from "./pilot-feedback-actions";

const initial: PilotFeedbackState = {};
export function PilotFeedbackForm({ enrollmentId }: { enrollmentId?: string }) {
  const [state, action, pending] = useActionState(pilotFeedbackSubmitAction, initial);
  return <form action={action} className="startup-form startup-pilot-form" aria-busy={pending}>{enrollmentId && <input type="hidden" name="enrollmentId" value={enrollmentId}/>}<label>Where did you get stuck?<select name="stage" defaultValue="" required><option value="" disabled>Choose a topic</option>{enrollmentId ? <><option value="LEARNING">Finding my next practice</option><option value="EVIDENCE">Submitting evidence</option><option value="MENTOR_FEEDBACK">Understanding mentor feedback</option></> : <><option value="SIGNUP">Creating or verifying my account</option><option value="APPLICATION">Completing the application</option><option value="STATUS">Understanding my status</option></>}</select></label><label>What would make this easier?<textarea name="message" minLength={20} maxLength={1200} rows={3} required placeholder="Tell the programme team what happened. Do not include passwords or payment details."/></label>{state.error && <p role="alert" className="startup-error">{state.error}</p>}<button type="submit" className="startup-secondary" disabled={pending}>{pending ? "Sending…" : "Send feedback to the team"}</button></form>;
}
export function PilotFeedbackDecisionForm({ id, version }: { id: string; version: number }) {
  const [state, action, pending] = useActionState(pilotFeedbackDecisionAction, initial);
  return <form action={action} className="startup-form startup-pilot-form" aria-busy={pending}><input type="hidden" name="id" value={id}/><input type="hidden" name="version" value={version}/><label>Review outcome<select name="status" defaultValue="" required><option value="" disabled>Choose an outcome</option><option value="ACKNOWLEDGED">Acknowledged, needs follow-up</option><option value="RESOLVED">Resolved</option></select></label><label>Reply or resolution note<textarea name="note" minLength={10} maxLength={1000} rows={2} required/></label>{state.error && <p role="alert" className="startup-error">{state.error}</p>}<button className="startup-secondary" disabled={pending}>{pending ? "Recording…" : "Record response"}</button></form>;
}
