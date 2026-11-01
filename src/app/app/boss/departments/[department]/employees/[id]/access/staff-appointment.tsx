"use client";

import { useActionState, useState } from "react";
import { accessAction, type AccessState } from "./actions";
import { StaffInvitePanel } from "@/components/staff-invite-panel";
import { bossStaffInviteAction, bossStaffReviewAction } from "@/app/app/boss/command/staff-actions";

type Scope = { organizationId: string; name: string; roleId: string; roleName: string; managers: { id: string; email: string }[] };
type Draft = { id: string; email: string; role: string; reviewable: boolean; decisionsRecorded: boolean };

function AppointmentForm({ employmentId, scope }: { employmentId: string; scope: Scope }) {
  const [state, action, pending] = useActionState(accessAction, {} as AccessState);
  const [manager, setManager] = useState("");
  return <form action={action} className="boss-hr-action-form"><input type="hidden" name="intent" value="prepare-staff"/><input type="hidden" name="employmentId" value={employmentId}/><input type="hidden" name="organizationId" value={scope.organizationId}/><input type="hidden" name="roleId" value={scope.roleId}/>
    <h3>{scope.roleName} · {scope.name}</h3>
    <label>Role and scope decision reference <input name="scopeDecisionReference" required minLength={8} maxLength={200}/></label>
    <label>Reviewed manager <select name="managerUserId" value={manager} onChange={event => setManager(event.target.value)}><option value="">Assign during review</option>{scope.managers.map(item => <option key={item.id} value={item.id}>{item.email}</option>)}</select></label>
    {manager && <label>Manager decision reference <input name="managerDecisionReference" required minLength={8} maxLength={200}/></label>}
    <p>This reuses the employee record and creates an inactive account draft. It does not send an invitation or grant login access.</p>
    <button className="button" disabled={pending}>{pending ? "Saving…" : "Prepare staff account"}</button>{state.error && <p role="alert">{state.error}</p>}{state.message && <p role="status">{state.message}</p>}
  </form>;
}

export function HrStaffAppointment({ employmentId, scopes, drafts, deliveryReady }: { employmentId: string; scopes: Scope[]; drafts: { scopeId: string; rows: Draft[]; managers: { id: string; email: string }[] }[]; deliveryReady: boolean }) {
  return <section className="executive-band boss-hr-staff-appointment"><h2>Staff appointment</h2>
    {scopes.length > 0 ? <><p>Choose the role that matches the approved employment. The portal follows the role: Labs developers use airalabs.online; the company Administrative Officer uses airaskillcity.com.</p>{scopes.map(scope => <AppointmentForm key={scope.organizationId} employmentId={employmentId} scope={scope}/>)}</> : drafts.length ? <p>Review the recorded scope and manager decision, then send the activation invitation.</p> : <p>No new staff appointment is available. An existing account or missing employment, assignment, role, or authorization may need review.</p>}
    {drafts.map(item => <div key={item.scopeId}><StaffInvitePanel rows={item.rows} action={bossStaffInviteAction} reviewAction={bossStaffReviewAction} managers={item.managers} deliveryReady={deliveryReady}/></div>)}
  </section>;
}
