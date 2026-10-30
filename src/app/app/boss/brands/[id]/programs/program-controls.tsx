"use client";
import { useActionState, useState } from "react";
import { programAction } from "./actions";
import type { StartupProgramDraft } from "@/server/group/startup-programs";

type Program = { id: string; name: string; slug: string; description: string | null; durationDays: number | null; capacity: number | null; priceMinor: number | null; currency: string | null; status: string; draft: StartupProgramDraft | null; publicationRequest: { id: string; status: string; version: number; ownerPersonId: string } | null };
const fields: { key: keyof StartupProgramDraft; label: string; long?: boolean }[] = [
  { key: "deliveryFormat", label: "Delivery format" }, { key: "curriculum", label: "Curriculum proposal", long: true }, { key: "learningOutcomes", label: "Learning outcomes", long: true },
  { key: "eligibility", label: "Eligibility", long: true }, { key: "intendedAudience", label: "Intended audience", long: true }, { key: "tierProposal", label: "Tier proposal (unapproved)", long: true },
  { key: "writtenTermsReference", label: "Written terms reference (unverified)" }, { key: "deliveryArrangements", label: "Mentors and delivery arrangements (proposal)", long: true }
];
export function ProgramControls({ brandId, program }: { brandId: string; program?: Program }) {
  const [state, action, pending] = useActionState(programAction, {});
  const [editing, setEditing] = useState(false);
  return <div className="startup-program-controls">
    {(!program || program.status === "DRAFT" || program.status === "PAUSED") && <><button type="button" className="button secondary" onClick={() => setEditing(value => !value)} aria-expanded={editing}>{editing ? "Close editor" : program ? program.status === "PAUSED" ? "Revise paused programme" : "Edit draft" : "Create draft programme"}</button>
      {editing && <form action={action} className="business-form"><input type="hidden" name="brandId" value={brandId}/><input type="hidden" name="programId" value={program?.id ?? ""}/><input type="hidden" name="operation" value="save"/>
        <label>Programme name<input name="name" required maxLength={200} defaultValue={program?.name ?? ""}/></label>
        <label>Identifier<input name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={120} defaultValue={program?.slug ?? ""}/></label>
        <label className="wide-field">Description<textarea name="description" maxLength={4000} defaultValue={program?.description ?? ""}/></label>
        <label>Duration (days)<input name="durationDays" type="number" min="1" step="1" defaultValue={program?.durationDays ?? ""}/></label>
        <label>Capacity proposal<input name="capacity" type="number" min="1" step="1" defaultValue={program?.capacity ?? ""}/></label>
        <label>Fee proposal in minor units (unapproved)<input name="priceMinor" type="number" min="0" step="1" defaultValue={program?.priceMinor ?? ""}/></label>
        <label>Currency code<input name="currency" maxLength={3} pattern="[A-Z]{3}" defaultValue={program?.currency ?? ""}/></label>
        {fields.map(field => <label key={field.key} className={field.long ? "wide-field" : ""}>{field.label}{field.long ? <textarea name={field.key} maxLength={4000} defaultValue={program?.draft?.[field.key] ?? ""}/> : <input name={field.key} maxLength={field.key === "writtenTermsReference" ? 300 : 200} defaultValue={program?.draft?.[field.key] ?? ""}/>}</label>)}
        <p className="wide-field muted">These are planning fields. A saved price or terms reference is not approval to sell, collect payment, admit or enrol.</p><button className="button" disabled={pending}>{pending ? "Saving…" : "Save draft"}</button>
      </form>}
    </>}
    {program && <div className="row-actions">
      {(program.status === "DRAFT" || program.status === "PAUSED") && <form action={action}><input type="hidden" name="brandId" value={brandId}/><input type="hidden" name="programId" value={program.id}/><input type="hidden" name="operation" value="request"/><button className="button secondary" disabled={pending || !!program.publicationRequest}>{program.publicationRequest?.status === "PENDING" ? "Review pending" : program.publicationRequest?.status === "REJECTED" ? "Revise draft before requesting again" : program.status === "PAUSED" ? "Request resumption review" : "Request publication review"}</button></form>}
      {program.status === "ACTIVE" && <form action={action}><input type="hidden" name="brandId" value={brandId}/><input type="hidden" name="programId" value={program.id}/><input type="hidden" name="operation" value="pause"/><button className="button secondary" disabled={pending}>Pause programme</button></form>}
      {program.status !== "ARCHIVED" && <form action={action}><input type="hidden" name="brandId" value={brandId}/><input type="hidden" name="programId" value={program.id}/><input type="hidden" name="operation" value="archive"/><button className="button secondary" disabled={pending} onClick={event => { if (!window.confirm("Archive this programme? Historical records will remain.")) event.preventDefault(); }}>Archive</button></form>}
    </div>}
    {program?.publicationRequest?.status === "PENDING" && <form action={action} className="business-form" aria-busy={pending}>
      <input type="hidden" name="brandId" value={brandId}/><input type="hidden" name="programId" value={program.id}/><input type="hidden" name="requestId" value={program.publicationRequest.id}/><input type="hidden" name="version" value={program.publicationRequest.version}/><input type="hidden" name="operation" value="decide"/>
      <h3>Independent publication review</h3><p className="wide-field muted">A different authorized reviewer must check the programme and the referenced written terms. This decision does not approve prices, tax, admissions, enrolment or payment.</p>
      <label>Decision<select name="decision" required defaultValue=""><option value="" disabled>Select decision</option><option value="APPROVED">Approve publication</option><option value="REJECTED">Reject request</option></select></label>
      <label>Evidence reference<input name="evidenceReference" required minLength={8} maxLength={300}/></label>
      <label className="wide-field">Reason<textarea name="reason" required minLength={8} maxLength={1000}/></label>
      <button className="button" disabled={pending}>{pending ? "Recording…" : "Record publication decision"}</button>
    </form>}
    {state.error && <p role="alert" className="error">{state.error}</p>}{state.success && <p role="status">{state.success}</p>}
  </div>;
}
