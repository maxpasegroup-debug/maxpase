"use client";
import { useActionState } from "react";
import { Mail } from "lucide-react";
import type { StaffDraftState } from "@/app/app/boss/command/staff-actions";

function InviteForm({ row, action, deliveryReady }: { row: { id: string; email: string; role: string }; action: (_state: StaffDraftState, form: FormData) => Promise<StaffDraftState>; deliveryReady: boolean }) {
  const [state, submit, pending] = useActionState(action, {} as StaffDraftState);
  return <form action={submit} className="sc-work-form"><input type="hidden" name="userId" value={row.id}/>
    <strong>{row.email}</strong><span>{row.role}</span>
    <label>Identity and manager verification evidence<textarea name="verificationEvidence" minLength={10} maxLength={1000} required/></label>
    {state.error && <p role="alert" className="error">{state.error}</p>}{state.message && <p role="status">{state.message}</p>}
    <button disabled={pending || !deliveryReady}><Mail size={17}/>{pending ? "Sending..." : "Send activation email"}</button>
  </form>;
}

export function StaffInvitePanel({ rows, action, deliveryReady }: { rows: { id: string; email: string; role: string }[]; action: (_state: StaffDraftState, form: FormData) => Promise<StaffDraftState>; deliveryReady: boolean }) {
  return <div className="sc-list">{!deliveryReady && <p role="status">Activation email is not configured. Set the Skill City sender, secret, Resend key and enable the feature before inviting staff.</p>}{!rows.length && <p>No inactive employee drafts await invitation in this scope.</p>}{rows.map(row => <InviteForm key={row.id} row={row} action={action} deliveryReady={deliveryReady}/>)}</div>;
}
