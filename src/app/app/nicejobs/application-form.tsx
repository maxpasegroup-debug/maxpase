"use client";
import { useActionState, useState, useRef, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { Check, LoaderCircle, Send, ArrowLeft, ArrowRight, ListChecks, MessagesSquare } from "lucide-react";
import { applicationAction, type ApplicationActionState } from "./application-actions";
import { matches, validateAnswers, type Answers, type FormConfiguration } from "@/server/nicejobs/application-configuration";
import { applicationFieldHint } from "@/server/nicejobs/application-guidance";

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
  const [guided, setGuided] = useState(true), [step, setStep] = useState(0), [validationError, setValidationError] = useState("");
  const questionHeading = useRef<HTMLHeadingElement>(null);
  const [state, action, pending] = useActionState(applicationAction, {} as ApplicationActionState);
  const visible = form.fields.filter(field => !field.when || matches(field.when, answers));
  const index = Math.min(step, Math.max(0, visible.length - 1));
  useEffect(() => { if (guided && step > 0) questionHeading.current?.focus(); }, [guided, step]);
  const update = (key: string, value: Answers[string] | undefined) => { setValidationError(""); setAnswers(prior => {
    const next = { ...prior }; if (value === undefined || value === "") delete next[key]; else next[key] = value;
    for (const f of form.fields) if (f.when && !matches(f.when, next)) delete next[f.key];
    return next;
  }); };
  const reviewAnswers = () => {
    try { validateAnswers(form, answers, true); setValidationError(""); setReview(true); }
    catch (error) { setValidationError(error instanceof Error ? error.message : "Check your answers."); }
  };
  const nextQuestion = () => {
    const field = visible[index], value = field && answers[field.key];
    if (field?.required && (value === undefined || value === "" || Array.isArray(value) && !value.length)) { setValidationError("Required: " + field.label); return; }
    try { validateAnswers(form, answers, false); setValidationError(""); setStep(index + 1); }
    catch (error) { setValidationError(error instanceof Error ? error.message : "Check your answer."); }
  };
  return <form action={action} className="nj-form">
    <input type="hidden" name="realm" value={realm} /><input type="hidden" name="reference" value={reference} /><input type="hidden" name="revision" value={revision} /><input type="hidden" name="answers" value={JSON.stringify(answers)} />
    {review ? <><h2>Review your application</h2><dl className="nj-detail">{visible.map(f => <div key={f.key}><dt>{f.label}</dt><dd>{String(answers[f.key] ?? "Not provided")}</dd></div>)}</dl><button type="button" className="button button-secondary" disabled={pending} onClick={() => setReview(false)}><ArrowLeft size={16} />Back to questions</button></> : <><div className="nj-guidance-modes" role="group" aria-label="Application question view"><button type="button" aria-pressed={guided} onClick={() => setGuided(true)}><MessagesSquare size={16} />Guided</button><button type="button" aria-pressed={!guided} onClick={() => setGuided(false)}><ListChecks size={16} />All questions</button></div>{guided && visible.length > 0 && <h2 ref={questionHeading} tabIndex={-1} className="nj-question-heading">Question {index + 1} of {visible.length}</h2>}<fieldset disabled={pending || !!state.success}>{(guided ? visible.slice(index, index + 1) : visible).map(f => <label key={f.key}>{f.label}{f.required && " *"}<small id={`hint-${f.key}`}>{applicationFieldHint(f)}</small>
      {f.type === "TEXTAREA" ? <textarea maxLength={4000} value={String(answers[f.key] ?? "")} onChange={e => update(f.key, e.target.value)} /> : ["SELECT", "MULTI_SELECT", "BOOLEAN"].includes(f.type) ? <select multiple={f.type === "MULTI_SELECT"} value={f.type === "MULTI_SELECT" ? answers[f.key] as string[] ?? [] : String(answers[f.key] ?? "")} onChange={e => update(f.key, f.type === "MULTI_SELECT" ? [...e.target.selectedOptions].map(o => o.value) : f.type === "BOOLEAN" ? e.target.value === "" ? undefined : e.target.value === "true" : e.target.value)}>{f.type !== "MULTI_SELECT" && <option value="">Select</option>}{f.type === "BOOLEAN" ? <><option value="true">Yes</option><option value="false">No</option></> : f.options?.map(o => <option key={o} value={o}>{o}</option>)}</select> : <input type={f.type === "NUMBER" ? "number" : f.type === "DATE" ? "date" : f.type === "EMAIL" ? "email" : f.type === "PHONE" ? "tel" : "text"} step={f.type === "NUMBER" ? "any" : undefined} maxLength={f.type === "DOCUMENT_REFERENCE" ? 200 : 500} value={String(answers[f.key] ?? "")} onChange={e => update(f.key, f.type === "NUMBER" ? e.target.value === "" ? undefined : Number(e.target.value) : e.target.value)} />}
    </label>)}</fieldset>{guided && visible.length > 1 && <div className="nj-actions"><button type="button" className="button button-secondary" disabled={pending || index === 0} onClick={() => { setValidationError(""); setStep(index - 1); }}><ArrowLeft size={16} />Previous</button>{index < visible.length - 1 && <button type="button" className="button" disabled={pending} onClick={nextQuestion}>Next question<ArrowRight size={16} /></button>}</div>}</>}
    {!state.success && <div className="nj-actions"><button className="button button-secondary" type="submit" name="operation" value="SAVE" disabled={pending}>Save draft</button>{review ? <button key="submit" className="button" type="submit" name="operation" value="SUBMIT" disabled={pending}><Send size={16} />{pending ? "Submitting" : "Submit application"}</button> : (!guided || index >= visible.length - 1) && <button key="review" className="button" type="button" onClick={reviewAnswers} disabled={pending}>Review application</button>}</div>}
    {validationError && <p role="alert">{validationError}</p>}
    {state.error && <p role="alert">{state.error}</p>}{state.success && <p role="status">{state.success}</p>}
  </form>;
}
