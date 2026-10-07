"use client";
import { useActionState, useState, type ReactNode } from "react";
import Link from "next/link";
import { Check, LoaderCircle, Send } from "lucide-react";
import { applicationAction, type ApplicationActionState } from "./application-actions";
import { matches, type Answers, type FormConfiguration } from "@/server/nicejobs/application-configuration";

export function ApplicationCommand({ realm, operation, reference, revision = 0, label, children, base, confirm = false, versionId }: { realm: string; operation: string; reference?: string; revision?: number; label: string; children?: ReactNode; base?: string; confirm?: boolean; versionId?: string }) {
  const [state, action, pending] = useActionState(applicationAction, {} as ApplicationActionState);
  return <form action={action} className="nj-form" onSubmit={e => { if (confirm && !window.confirm(label + "?")) e.preventDefault(); }}>
    <input type="hidden" name="realm" value={realm} /><input type="hidden" name="operation" value={operation} /><input type="hidden" name="reference" value={reference ?? ""} /><input type="hidden" name="revision" value={revision} /><input type="hidden" name="versionId" value={versionId ?? ""} />
    <fieldset disabled={pending}>{children}<button className="button" disabled={pending || !!state.success} type="submit">{pending ? <LoaderCircle size={16} /> : <Check size={16} />}{pending ? "Saving" : label}</button></fieldset>
    {state.error && <p role="alert">{state.error}</p>}{state.success && <p role="status">{state.success} {base && state.reference && <Link href={`${base}${base.includes("?") ? "&" : "?"}reference=${state.reference}`}>Open application</Link>}</p>}
  </form>;
}
export function CandidateApplicationForm({ realm, reference, revision, form, initial }: { realm: string; reference: string; revision: number; form: FormConfiguration; initial: Answers }) {
  const [answers, setAnswers] = useState(initial), [review, setReview] = useState(false);
  const [state, action, pending] = useActionState(applicationAction, {} as ApplicationActionState);
  const update = (key: string, value: Answers[string] | undefined) => setAnswers(prior => {
    const next = { ...prior }; if (value === undefined || value === "") delete next[key]; else next[key] = value;
    for (const f of form.fields) if (f.when && !matches(f.when, next)) delete next[f.key];
    return next;
  });
  return <form action={action} className="nj-form">
    <input type="hidden" name="realm" value={realm} /><input type="hidden" name="reference" value={reference} /><input type="hidden" name="revision" value={revision} /><input type="hidden" name="answers" value={JSON.stringify(answers)} />
    {review ? <><h2>Review your application</h2><dl className="nj-detail">{form.fields.filter(f => !f.when || matches(f.when, answers)).map(f => <div key={f.key}><dt>{f.label}</dt><dd>{String(answers[f.key] ?? "Not provided")}</dd></div>)}</dl><button type="button" className="button button-secondary" onClick={() => setReview(false)}>Back to form</button></> : <fieldset disabled={pending || !!state.success}>{form.fields.filter(f => !f.when || matches(f.when, answers)).map(f => <label key={f.key}>{f.label}{f.required && " *"}
      {f.type === "TEXTAREA" ? <textarea maxLength={4000} value={String(answers[f.key] ?? "")} onChange={e => update(f.key, e.target.value)} /> : ["SELECT", "MULTI_SELECT", "BOOLEAN"].includes(f.type) ? <select multiple={f.type === "MULTI_SELECT"} value={f.type === "MULTI_SELECT" ? answers[f.key] as string[] ?? [] : String(answers[f.key] ?? "")} onChange={e => update(f.key, f.type === "MULTI_SELECT" ? [...e.target.selectedOptions].map(o => o.value) : f.type === "BOOLEAN" ? e.target.value === "" ? undefined : e.target.value === "true" : e.target.value)}>{f.type !== "MULTI_SELECT" && <option value="">Select</option>}{f.type === "BOOLEAN" ? <><option value="true">Yes</option><option value="false">No</option></> : f.options?.map(o => <option key={o} value={o}>{o}</option>)}</select> : <input type={f.type === "NUMBER" ? "number" : f.type === "DATE" ? "date" : f.type === "EMAIL" ? "email" : f.type === "PHONE" ? "tel" : "text"} step={f.type === "NUMBER" ? "any" : undefined} maxLength={f.type === "DOCUMENT_REFERENCE" ? 200 : 500} value={String(answers[f.key] ?? "")} onChange={e => update(f.key, f.type === "NUMBER" ? e.target.value === "" ? undefined : Number(e.target.value) : e.target.value)} />}
    </label>)}</fieldset>}
    {!state.success && <div className="nj-actions"><button className="button button-secondary" type="submit" name="operation" value="SAVE" disabled={pending}>Save draft</button>{review ? <button key="submit" className="button" type="submit" name="operation" value="SUBMIT" disabled={pending}><Send size={16} />{pending ? "Submitting" : "Submit application"}</button> : <button key="review" className="button" type="button" onClick={e => { e.preventDefault(); setReview(true); }} disabled={pending}>Review application</button>}</div>}
    {state.error && <p role="alert">{state.error}</p>}{state.success && <p role="status">{state.success}</p>}
  </form>;
}
