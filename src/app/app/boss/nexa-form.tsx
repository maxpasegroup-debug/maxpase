"use client";
import { useActionState, useState } from "react";
import { createNexaDirectiveAction } from "./nexa-actions";

export function NexaInstructionForm({ companies, directors, reference }: { companies: { id: string; name: string }[]; directors: { id: string; email: string; organizationId: string }[]; reference: string }) {
  const [state, action, pending] = useActionState(createNexaDirectiveAction, {});
  const [companyId, setCompanyId] = useState("");
  return <form action={action} className="sc-work-form" aria-busy={pending}><input type="hidden" name="idempotencyKey" value={reference}/><label>Company<select name="organizationId" value={companyId} onChange={event => setCompanyId(event.target.value)} required><option value="">Choose a company</option>{companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label><label>Responsible director<select key={companyId} name="directorUserId" required><option value="">Choose a verified director</option>{directors.filter(d => d.organizationId === companyId).map(d => <option key={d.id} value={d.id}>{d.email}</option>)}</select></label><label>Private Boss instruction<textarea name="instruction" minLength={10} maxLength={3000} required/></label><label>Director brief<textarea name="directorBrief" minLength={10} maxLength={2000} required/></label><p className="muted">The director sees the brief, not the private instruction. This creates a review item, not an executed action.</p>{state.error && <p role="alert" className="error">{state.error}</p>}{state.message && <p role="status">{state.message}</p>}<button disabled={pending || !directors.some(d => d.organizationId === companyId)}>{pending ? "Recording..." : "Send for director review"}</button></form>;
}
