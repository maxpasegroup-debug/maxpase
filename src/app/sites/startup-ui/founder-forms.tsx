"use client";
import { useActionState, useState } from "react";
import { founderApprovePlanAction, founderCommunityAction, founderPlanAction, founderReviewAction, founderSubmitAction, type FounderActionState } from "./founder-actions";

const initial: FounderActionState = {};
export function EvidenceForm({ batchId, milestoneKey, version }: { batchId: string; milestoneKey: string; version?: number }) {
  const [state, action, pending] = useActionState(founderSubmitAction, initial);
  return <form action={action} className="startup-form startup-founder-form" aria-busy={pending}><input type="hidden" name="batchId" value={batchId}/><input type="hidden" name="milestoneKey" value={milestoneKey}/>{version !== undefined && <input type="hidden" name="version" value={version}/>}<label>Your practice evidence<textarea name="text" minLength={20} maxLength={4000} rows={4} required placeholder="What did you do, observe, and learn?"/></label>{state.error && <p role="alert" className="startup-error">{state.error}</p>}<button className="startup-primary" disabled={pending}>{pending ? "Submitting…" : version === undefined ? "Submit for mentor review" : "Resubmit after feedback"}</button></form>;
}
export function PlanForm({ batchId }: { batchId: string }) {
  const [state, action, pending] = useActionState(founderPlanAction, initial);
  const [count, setCount] = useState(3);
  return <form action={action} className="startup-form startup-founder-form" aria-busy={pending}><input type="hidden" name="batchId" value={batchId}/><label>Approved path for this batch<select name="tier" required defaultValue=""><option value="" disabled>Select the verified tier</option><option value="STARTER">Starter</option><option value="PRO">Pro</option><option value="EXTRAORDINARY">Extraordinary Entrepreneur</option></select></label><label>Written terms approval reference<input name="termsApprovalRef" minLength={8} maxLength={300} required placeholder="Reference to approved, versioned programme terms"/></label><p className="startup-founder-help">Drafts are private. A different authorized reviewer must approve before participants see milestones or the community board.</p>{Array.from({ length: count }, (_, index) => <fieldset key={index} className="startup-founder-step"><legend>Milestone {index + 1}</legend><label>Outcome<input name="title" minLength={3} maxLength={120} required/></label><label>Practical activity<textarea name="practice" minLength={20} maxLength={1200} rows={3} required/></label><label>Evidence to submit<textarea name="evidencePrompt" minLength={10} maxLength={500} rows={2} required/></label></fieldset>)}<button type="button" className="startup-secondary" onClick={() => setCount(Math.min(24, count + 1))} disabled={count >= 24}>Add milestone</button>{state.error && <p role="alert" className="startup-error">{state.error}</p>}<button className="startup-primary" disabled={pending}>{pending ? "Saving…" : "Save private draft"}</button></form>;
}
export function ApprovePlanForm({ batchId, version }: { batchId: string; version: number }) {
  const [state, action, pending] = useActionState(founderApprovePlanAction, initial);
  return <form action={action} className="startup-form" aria-busy={pending}><input type="hidden" name="batchId" value={batchId}/><input type="hidden" name="version" value={version}/>{state.error && <p role="alert" className="startup-error">{state.error}</p>}<button className="startup-primary" disabled={pending}>{pending ? "Approving…" : "Approve reviewed plan"}</button></form>;
}
export function ReviewEvidenceForm({ evidenceId, version }: { evidenceId: string; version: number }) {
  const [state, action, pending] = useActionState(founderReviewAction, initial);
  return <form action={action} className="startup-form" aria-busy={pending}><input type="hidden" name="evidenceId" value={evidenceId}/><input type="hidden" name="version" value={version}/><label>Decision<select name="decision" required defaultValue=""><option value="" disabled>Choose a decision</option><option value="ACCEPTED">Accept evidence</option><option value="REWORK_REQUIRED">Request rework</option></select></label><label>Feedback for the founder<textarea name="feedback" minLength={10} maxLength={1200} required rows={3}/></label>{state.error && <p role="alert" className="startup-error">{state.error}</p>}<button className="startup-primary" disabled={pending}>{pending ? "Recording…" : "Record mentor feedback"}</button></form>;
}
export function CommunityNoteForm({ batchId }: { batchId: string }) {
  const [state, action, pending] = useActionState(founderCommunityAction, initial);
  return <form action={action} className="startup-form" aria-busy={pending}><input type="hidden" name="batchId" value={batchId}/><label>Update title<input name="title" minLength={3} maxLength={120} required/></label><label>Message<textarea name="message" minLength={10} maxLength={2000} rows={3} required/></label>{state.error && <p role="alert" className="startup-error">{state.error}</p>}<button className="startup-primary" disabled={pending}>{pending ? "Posting…" : "Post to this batch"}</button></form>;
}
