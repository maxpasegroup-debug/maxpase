"use client";
import { useActionState } from "react";
import { UserPlus } from "lucide-react";
import type { StaffDraftState } from "@/app/app/boss/command/staff-actions";

export function StaffDraftForm({ action, organizationId, roles, managers }: {
  action: (_state: StaffDraftState, form: FormData) => Promise<StaffDraftState>;
  organizationId: string;
  roles: { id: string; name: string }[];
  managers: { id: string; email: string }[];
}) {
  const [state, submit, pending] = useActionState(action, {} as StaffDraftState);
  return <form action={submit} className="sc-work-form"><input type="hidden" name="organizationId" value={organizationId}/>
    <label>Employee name<input name="displayName" minLength={2} maxLength={200} required/></label>
    <label>Work email<input name="email" type="email" maxLength={254} autoComplete="off" required/></label>
    <label>Role<select name="roleId" required><option value="">Select an authorized role</option>{roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
    <label>Manager<select name="managerUserId"><option value="">Pending assignment</option>{managers.map(manager => <option key={manager.id} value={manager.id}>{manager.email}</option>)}</select></label>
    <p className="muted">This saves an inactive draft only. Identity, employment terms, role permissions and credential delivery must be verified before access is activated.</p>
    {state.error && <p role="alert" className="error">{state.error}</p>}{state.message && <p role="status">{state.message}</p>}
    <button disabled={pending || roles.length === 0}><UserPlus size={17}/>{pending ? "Recording..." : "Create onboarding draft"}</button>
  </form>;
}
