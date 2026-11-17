"use client";

import { useActionState } from "react";
import { assignAdmissionsOfficer, assignBossAdmissionsOfficer, completeAdmissionsFollowup, forwardAdmissionsApplication, recordAdmissionsFollowup, recordStartupLeadershipDecision, type AdmissionsActionState } from "./startup-admissions-actions";

function FormStatus({ state }: { state: AdmissionsActionState }) { return state.error ? <p className="sad-error" role="alert">{state.error}</p> : state.message ? <p className="sad-success" role="status">{state.message}</p> : null; }
const initial: AdmissionsActionState = {};

export function FollowupForm({ caseId }: { caseId: string }) {
  const [state, action, pending] = useActionState(recordAdmissionsFollowup, initial);
  return <form action={action} className="sad-form"><input type="hidden" name="caseId" value={caseId}/><div className="sad-form-grid"><label>Contact method<select name="contactMethod"><option value="CALL">Phone call</option><option value="WHATSAPP">WhatsApp</option><option value="EMAIL">Email</option><option value="OTHER">Other</option></select></label><label>Outcome<select name="outcome"><option value="CONTACTED">Contacted</option><option value="NO_ANSWER">No answer</option><option value="CALLBACK_REQUESTED">Callback requested</option><option value="CLARIFICATION_REQUIRED">Clarification required</option><option value="OTHER">Other</option></select></label><label>Next follow-up (optional)<input type="datetime-local" name="nextFollowUpAt"/></label></div><label>Note<textarea name="note" minLength={8} maxLength={2000} required placeholder="Record the contact attempt and next step."/></label><FormStatus state={state}/><button disabled={pending}>{pending ? "Saving…" : "Record follow-up"}</button></form>;
}

export function ForwardForm({ caseId }: { caseId: string }) {
  const [state, action, pending] = useActionState(forwardAdmissionsApplication, initial);
  return <form action={action} className="sad-form"><input type="hidden" name="caseId" value={caseId}/><input type="hidden" name="outcome" value="READY_FOR_LEADERSHIP_REVIEW"/><label>Officer review summary<textarea name="reviewNote" minLength={20} maxLength={2000} required placeholder="Summarize verification, applicant readiness and any concerns."/></label><div className="sad-checks"><label><input type="checkbox" name="contactVerified" value="yes" required/> Mobile contact verified</label><label><input type="checkbox" name="programReviewed" value="yes" required/> Program preference reviewed</label><label><input type="checkbox" name="locationReviewed" value="yes" required/> State and district reviewed</label></div><FormStatus state={state}/><button disabled={pending}>{pending ? "Forwarding…" : "Forward to Director / Boss"}</button><small>Forwarding starts a leadership review. It does not approve admission.</small></form>;
}

export function AssignmentForm({ caseId, officers, assignedUserId, bossBrandId }: { caseId: string; officers: { id: string; name: string }[]; assignedUserId: string | null; bossBrandId?: string }) {
  const bossAction = bossBrandId ? assignBossAdmissionsOfficer.bind(null, bossBrandId) : null;
  const [state, action, pending] = useActionState(bossAction ?? assignAdmissionsOfficer, initial);
  return <form action={action} className="sad-form sad-assignment"><input type="hidden" name="caseId" value={caseId}/><label>Assigned officer<select name="assignedUserId" defaultValue={assignedUserId ?? ""}><option value="">Unassigned</option>{officers.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label><label>Reason for assignment or change<input name="reason" minLength={8} maxLength={500} required placeholder="For example, assigned for first contact."/></label><FormStatus state={state}/><button disabled={pending}>{pending ? "Saving…" : "Save assignment"}</button></form>;
}

export function LeadershipDecisionForm({ caseId, version, status, bossBrandId }: { caseId: string; version: number; status: string; bossBrandId: string | null }) {
  const bound = recordStartupLeadershipDecision.bind(null, bossBrandId);
  const [state, action, pending] = useActionState(bound, initial);
  const allowed = status === "SUBMITTED" || status === "IN_REVIEW";
  if (!allowed) return <p className="sad-muted">This application is awaiting AO follow-up or has a final decision. Review actions unlock when the AO forwards it again.</p>;
  return <form action={action} className="sad-form"><input type="hidden" name="caseId" value={caseId}/><input type="hidden" name="version" value={version}/><label>Leadership action<select name="decision" required defaultValue=""><option value="" disabled>Select an action</option>{status === "SUBMITTED"&&<option value="IN_REVIEW">Begin leadership review</option>}<option value="APPROVED">Approve application</option><option value="REJECTED">Reject application</option><option value="CLARIFICATION_REQUIRED">Request clarification from AO</option>{status === "IN_REVIEW"&&<option value="RETURNED_TO_AO">Return to AO for follow-up</option>}</select></label><label>Decision reason / guidance<textarea name="reason" minLength={8} maxLength={1000} required placeholder="Explain the decision or what the AO needs to follow up."/></label><p className="sad-muted">Each action records the prior status, new status, reviewer and timestamp. Approval is not admission, enrollment, credential creation or payment.</p><FormStatus state={state}/><button disabled={pending}>{pending?"Recording…":"Record leadership action"}</button></form>;
}

export function CompleteFollowupForm({ caseId, followUpId }: { caseId: string; followUpId: string }) {
  const [state, action, pending] = useActionState(completeAdmissionsFollowup, initial);
  return <form action={action} className="sad-inline-form"><input type="hidden" name="caseId" value={caseId}/><input type="hidden" name="followUpId" value={followUpId}/><button className="sad-secondary" disabled={pending}>{pending ? "Updating…" : "Mark complete"}</button><FormStatus state={state}/></form>;
}
