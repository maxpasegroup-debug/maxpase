"use client";

import { useActionState, useState } from "react";
import { accessAction, type AccessState } from "./actions";
import { StaffInvitePanel } from "@/components/staff-invite-panel";
import { bossStaffInviteAction, bossStaffReviewAction } from "@/app/app/boss/command/staff-actions";

type Scope = { organizationId: string; name: string; roleId: string; roleName: string; phone?: string | null; managers: { id: string; email: string }[] };
type Draft = { id: string; email: string; role: string; reviewable: boolean; decisionsRecorded: boolean };

function AppointmentForm({ employmentId, scope, bossUserId }: { employmentId: string; scope: Scope; bossUserId?: string }) {
  const [state, action, pending] = useActionState(accessAction, {} as AccessState);
  const [manager, setManager] = useState("");
  const isNiceJobsDirector = scope.roleName === "NICEJOBS Director";
  const selectedManager = bossUserId && !manager ? bossUserId : manager;
  return <form action={action} className="boss-hr-action-form"><input type="hidden" name="intent" value="prepare-staff"/><input type="hidden" name="employmentId" value={employmentId}/><input type="hidden" name="organizationId" value={scope.organizationId}/><input type="hidden" name="roleId" value={scope.roleId}/>
    <h3>{scope.roleName} · {scope.name}</h3>
    <input type="hidden" name="scopeDecisionReference" value="Boss HR appointment"/>
    <input type="hidden" name="managerDecisionReference" value="Boss HR appointment"/>
    {isNiceJobsDirector && <><label>Country <select name="country" defaultValue="IN"><option value="IN">India (+91)</option><option value="US">United States (+1)</option><option value="GB">United Kingdom (+44)</option><option value="CA">Canada (+1)</option><option value="AU">Australia (+61)</option></select></label><label>Mobile number <input name="nationalNumber" type="tel" inputMode="tel" autoComplete="tel-national" defaultValue={scope.phone ?? ""} required/></label></>}
    {!isNiceJobsDirector && <><label>Reports to <select name="managerUserId" value={selectedManager} onChange={event => setManager(event.target.value)} required><option value="">Choose Boss, Director or Manager</option>{bossUserId && !scope.managers.some(item => item.id === bossUserId) && <option value={bossUserId}>Group Boss (you)</option>}{scope.managers.map(item => <option key={item.id} value={item.id}>{item.email}</option>)}</select></label><p>We’ll allocate the selected role-based dashboard and send secure setup instructions. The employee verifies their email and creates their own password.</p></>}
    {isNiceJobsDirector && <p>We’ll email the Director setup link. They must verify email and mobile access and set their own NICEJOBS PIN before permissions activate.</p>}
    <button className="button" disabled={pending || !isNiceJobsDirector && !selectedManager}>{pending ? "Setting up access…" : "Allocate dashboard and send setup"}</button>{state.error && <p role="alert">{state.error}</p>}{state.message && <p role="status">{state.message}</p>}
  </form>;
}

export function HrStaffAppointment({ employmentId, scopes, drafts, deliveryReady, bossUserId }: { employmentId: string; scopes: Scope[]; drafts: { scopeId: string; rows: Draft[]; managers: { id: string; email: string }[] }[]; deliveryReady: boolean; bossUserId?: string }) {
  return <section className="executive-band boss-hr-staff-appointment"><h2>Staff appointment</h2>
    {scopes.length > 0 ? <><p>Allocate the role-based dashboard for this existing employee and send secure setup instructions. No duplicate employee record is created.</p>{scopes.map(scope => <AppointmentForm key={scope.organizationId} employmentId={employmentId} scope={scope} bossUserId={bossUserId}/>)}</> : drafts.length ? <p>Use the saved appointment to resend setup instructions.</p> : <p>No dashboard role is ready for this employee’s company or work area. Ask the Boss to review the role setup.</p>}
    {drafts.map(item => <div key={item.scopeId}><StaffInvitePanel rows={item.rows} action={bossStaffInviteAction} reviewAction={bossStaffReviewAction} managers={item.managers} deliveryReady={deliveryReady}/></div>)}
  </section>;
}
