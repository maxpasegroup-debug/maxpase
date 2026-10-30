"use client";
import { useActionState } from "react";
import { associateProgramme, confirmAdmission, decideApplication } from "./actions";

export function ReviewControls({ brandId, id, version, status }: { brandId: string; id: string; version: number; status: string }) {
  const [state, action, pending] = useActionState(decideApplication, {});
  if (status !== "SUBMITTED" && status !== "IN_REVIEW") return null;
  return <form action={action} className="startup-admissions-review" aria-busy={pending}>
    <input type="hidden" name="brandId" value={brandId}/><input type="hidden" name="id" value={id}/><input type="hidden" name="version" value={version}/>
    <label>Application decision<select name="decision" required defaultValue=""><option value="" disabled>Select a decision</option>{status === "SUBMITTED" && <option value="IN_REVIEW">Begin review</option>}<option value="APPROVED">Approve application</option><option value="REJECTED">Reject application</option></select></label>
    <label>Reason<textarea name="reason" required minLength={5} maxLength={1000} rows={3}/></label>
    <p className="muted">Approval records the application review only. It does not approve a programme, fee, admission place, enrolment or payment.</p>
    <button className="button" disabled={pending}>{pending ? "Recording…" : "Record decision"}</button>
    {state.error && <p role="alert" className="error">{state.error}</p>}{state.success && <p role="status">{state.success}</p>}
  </form>;
}
export function ProgrammeAssociation({ brandId, id, version, programmes }: { brandId: string; id: string; version: number; programmes: { id: string; name: string; status: string }[] }) {
  const [state, action, pending] = useActionState(associateProgramme, {});
  if (!programmes.length) return <p>No verified PBA programme is linked to this brand. Configure its Program and product mapping before associating an application.</p>;
  return <form action={action} className="startup-admissions-review" aria-busy={pending}><input type="hidden" name="brandId" value={brandId}/><input type="hidden" name="id" value={id}/><input type="hidden" name="version" value={version}/><label>Associate an existing PBA programme<select name="programId" required defaultValue=""><option value="" disabled>Select a programme</option>{programmes.map(programme => <option key={programme.id} value={programme.id}>{programme.name} · {programme.status}</option>)}</select></label><p className="muted">This records an association for review. A draft or active status does not approve terms, admission, enrolment or payment.</p><button className="button secondary" disabled={pending}>{pending ? "Linking…" : "Record association"}</button>{state.error && <p role="alert" className="error">{state.error}</p>}{state.success && <p role="status">{state.success}</p>}</form>;
}
export function AdmissionConfirmation({ brandId, applicationId, version, batches }: { brandId: string; applicationId: string; version: number; batches: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(confirmAdmission, {});
  if (!batches.length) return <p role="status">No active intake is linked to this approved application. An authorized manager must prepare and independently approve the intake and written terms before admission can be confirmed.</p>;
  return <form action={action} className="startup-admissions-review" aria-busy={pending}><h3>Confirm admission separately</h3><input type="hidden" name="brandId" value={brandId}/><input type="hidden" name="applicationId" value={applicationId}/><input type="hidden" name="version" value={version}/><label>Active intake<select name="batchId" required defaultValue=""><option value="" disabled>Select intake</option>{batches.map(batch => <option key={batch.id} value={batch.id}>{batch.name}</option>)}</select></label><label>Decision reason<textarea name="reason" minLength={8} maxLength={1000} required/></label><p className="muted">A different authorized person must confirm admission. The server verifies the approved intake, terms, role authority and participant consent. This action does not enrol anyone or collect payment.</p><button className="button" disabled={pending}>{pending ? "Checking…" : "Confirm admission"}</button>{state.error && <p role="alert">{state.error}</p>}{state.success && <p role="status">{state.success}</p>}</form>;
}
