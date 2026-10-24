"use client";
import { useActionState, useState } from "react";
import { Mail } from "lucide-react";
import type { StaffDraftState } from "@/app/app/boss/command/staff-actions";

type DraftRow = { id: string; email: string; role: string; reviewable?: boolean; decisionsRecorded?: boolean };
type StaffAction = (_state: StaffDraftState, form: FormData) => Promise<StaffDraftState>;

function ReviewForm({ row, action, managers }: { row: DraftRow; action: StaffAction; managers: { id: string; email: string }[] }) {
  const [state, submit, pending] = useActionState(action, {} as StaffDraftState);
  const [manager, setManager] = useState("");
  const requiresManager = !["Director", "Division Director"].includes(row.role);
  return <form action={submit} className="sc-work-form"><input type="hidden" name="userId" value={row.id}/>
    <label>Scope decision reference<input name="scopeDecisionReference" minLength={8} maxLength={200} required/></label>
    {requiresManager && <><label>Approved manager<select name="managerUserId" value={manager} onChange={event => setManager(event.target.value)} required><option value="">Select manager</option>{managers.map(person => <option key={person.id} value={person.id}>{person.email}</option>)}</select></label><label>Manager decision reference<input name="managerDecisionReference" minLength={8} maxLength={200} required/></label></>}
    {state.error && <p role="alert" className="error">{state.error}</p>}{state.message && <p role="status">{state.message}</p>}
    <button disabled={pending || requiresManager && !managers.length}>{pending ? "Recording..." : "Record decisions"}</button>
  </form>;
}

function InviteForm({ row, action, deliveryReady, reviewAction, managers }: { row: DraftRow; action: StaffAction; deliveryReady: boolean; reviewAction?: StaffAction; managers: { id: string; email: string }[] }) {
  const [state, submit, pending] = useActionState(action, {} as StaffDraftState);
  return <div>{reviewAction && row.reviewable && <details><summary>Review scope and manager</summary><ReviewForm row={row} action={reviewAction} managers={managers}/></details>}
    {!row.decisionsRecorded && <p role="status">Scope and manager decisions need Boss review before invitation.</p>}
    <form action={submit} className="sc-work-form"><input type="hidden" name="userId" value={row.id}/>
    <strong>{row.email}</strong><span>{row.role}</span>
    <label>Identity and manager verification evidence<textarea name="verificationEvidence" minLength={10} maxLength={1000} required/></label>
    {state.error && <p role="alert" className="error">{state.error}</p>}{state.message && <p role="status">{state.message}</p>}
    <button disabled={pending || !deliveryReady || !row.decisionsRecorded}><Mail size={17}/>{pending ? "Sending..." : "Send activation email"}</button>
  </form></div>;
}

export function StaffInvitePanel({ rows, action, deliveryReady, reviewAction, managers = [] }: { rows: DraftRow[]; action: StaffAction; deliveryReady: boolean; reviewAction?: StaffAction; managers?: { id: string; email: string }[] }) {
  return <div className="sc-list">{!deliveryReady && <p role="status">Activation email is not configured. Set the Skill City sender, secret, Resend key and enable the feature before inviting staff.</p>}{!rows.length && <p>No inactive employee drafts await invitation in this scope.</p>}{rows.map(row => <InviteForm key={row.id} row={row} action={action} deliveryReady={deliveryReady} reviewAction={reviewAction} managers={managers}/>)}</div>;
}
