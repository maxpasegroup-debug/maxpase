"use client";
import { useActionState } from "react";
import { commercialAction, type CommercialState } from "./actions";

function Form({ children, brandId, mode, operation, recordId, version, label }: { children?: React.ReactNode; brandId: string; mode: "BOSS" | "SKILLCITY"; operation: string; recordId?: string; version?: number; label: string }) {
  const [state, action, pending] = useActionState<CommercialState, FormData>(commercialAction, {});
  return <form action={action} className="business-form"><input type="hidden" name="mode" value={mode}/><input type="hidden" name="brandId" value={brandId}/><input type="hidden" name="operation" value={operation}/><input type="hidden" name="recordId" value={recordId ?? ""}/><input type="hidden" name="version" value={version ?? 0}/>{children}<button className="button" disabled={pending}>{pending ? "Saving…" : label}</button>{state.error && <p role="alert" className="error">{state.error}</p>}{state.success && <p role="status">{state.success}</p>}</form>;
}
export function CommercialDraftForm({ brandId, mode, programs }: { brandId: string; mode: "BOSS" | "SKILLCITY"; programs: { id: string; name: string; status: string }[] }) {
  return <Form brandId={brandId} mode={mode} operation="prepare" label="Save proposed terms"><label>Programme<select name="programId" required><option value="">Choose a programme</option>{programs.map(program => <option key={program.id} value={program.id}>{program.name} · {program.status}</option>)}</select></label><label>Written terms version/reference<input name="termsReference" required minLength={8} maxLength={300}/></label><label>Proposed fee before tax (₹)<input name="fee" type="number" required min="0" max="9999999" step="0.01"/></label><input type="hidden" name="currency" value="INR"/><label>Proposed tax basis points (subject to verified policy)<input name="taxBasisPoints" type="number" required min="0" max="10000" step="1"/></label><p className="muted">This is an internal proposal. A reference or amount entered here is not an approved offer or invoice.</p></Form>;
}
export function CommercialDecisionForm({ brandId, mode, recordId, version, operation }: { brandId: string; mode: "BOSS" | "SKILLCITY"; recordId: string; version: number; operation: "SUBMIT" | "APPROVE" | "REJECT" }) {
  return <Form brandId={brandId} mode={mode} recordId={recordId} version={version} operation={operation} label={operation === "SUBMIT" ? "Request independent review" : operation === "APPROVE" ? "Approve terms" : "Reject terms"}>{operation !== "SUBMIT" && <><label>Decision reason<textarea name="reason" required minLength={8} maxLength={1000}/></label><label>Approval evidence reference<input name="evidenceReference" required minLength={8} maxLength={300}/></label></>}</Form>;
}
