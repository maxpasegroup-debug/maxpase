"use client";
import { useActionState, useState } from "react";
import { UserPlus } from "lucide-react";
import type { StaffDraftState } from "@/app/app/boss/command/staff-actions";

export function StaffDraftForm({ action, organizationId, roles, managers, existingPeople = [] }: {
  action: (_state: StaffDraftState, form: FormData) => Promise<StaffDraftState>;
  organizationId: string;
  roles: { id: string; name: string }[];
  managers: { id: string; email: string }[];
  existingPeople?: { id: string; displayName: string; email: string | null }[];
}) {
  const [state, submit, pending] = useActionState(action, {} as StaffDraftState);
  const [existing, setExisting] = useState(false);
  const [manager, setManager] = useState("");
  return <form action={submit} className="sc-work-form"><input type="hidden" name="organizationId" value={organizationId}/>
    {existingPeople.length > 0 && <div role="group" aria-label="Person record"><button type="button" aria-pressed={!existing} onClick={() => setExisting(false)}>New person</button><button type="button" aria-pressed={existing} onClick={() => setExisting(true)}>Existing person</button></div>}
    {existing ? <label>Existing person<select name="existingPersonId" required><option value="">Select a reviewed person</option>{existingPeople.map(person => <option key={person.id} value={person.id}>{person.displayName} / {person.email}</option>)}</select></label> : <><label>Employee name<input name="displayName" minLength={2} maxLength={200} required/></label><label>Work email<input name="email" type="email" maxLength={254} autoComplete="off" required/></label></>}
    <label>Role<select name="roleId" required><option value="">Select an authorized role</option>{roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
    <label>Scope decision reference<input name="scopeDecisionReference" minLength={8} maxLength={200} required/></label>
    <label>Manager<select name="managerUserId" value={manager} onChange={event => setManager(event.target.value)}><option value="">Pending assignment</option>{managers.map(person => <option key={person.id} value={person.id}>{person.email}</option>)}</select></label>
    {manager && <label>Manager decision reference<input name="managerDecisionReference" minLength={8} maxLength={200} required/></label>}
    <p className="muted">This saves an inactive draft only. Identity, employment terms, role permissions and credential delivery must be verified before access is activated.</p>
    {state.error && <p role="alert" className="error">{state.error}</p>}{state.message && <p role="status">{state.message}</p>}
    <button disabled={pending || roles.length === 0}><UserPlus size={17}/>{pending ? "Recording..." : "Create onboarding draft"}</button>
  </form>;
}
