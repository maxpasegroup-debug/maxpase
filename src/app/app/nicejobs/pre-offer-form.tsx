"use client";
import { useActionState, useState } from "react";
import { applicationAction, type ApplicationActionState } from "./application-actions";
import type { FormConfiguration } from "@/server/nicejobs/application-configuration";
import { Check, LoaderCircle } from "lucide-react";

export function PreOfferForm({ realm, reference, detail }: { realm: string; reference: string; detail: { revision: number; fingerprint: string; passed: boolean; accepted: boolean; actionable: boolean; form: FormConfiguration; policies: { key: string; title: string; version: string; text: string }[]; videoUrl: string; videoTitle: string; videoVersion: string; attempts: number; maxAttempts: number } }) {
  const [ended, setEnded] = useState(false);
  const [state, action, pending] = useActionState(async (previous: ApplicationActionState, form: FormData) => {
    const answers: Record<string, unknown> = {};
    for (const field of detail.form.fields) {
      const value = form.get(field.key);
      if (value !== null && value !== "") answers[field.key] = field.type === "BOOLEAN" ? value === "true" : field.type === "NUMBER" ? Number(value) : field.type === "MULTI_SELECT" ? form.getAll(field.key) : value;
    }
    form.set("operation", "PRE_OFFER"); form.set("realm", realm);
    form.set("command", JSON.stringify({ reference, revision: detail.revision, fingerprint: detail.fingerprint, idempotencyKey: crypto.randomUUID(), action: detail.passed ? "ACCEPT_POLICIES" : "COMPLETE_ORIENTATION", acknowledged: form.get("acknowledged") === "on", ...(!detail.passed ? { answers } : {}) }));
    return applicationAction(previous, form);
  }, {} as ApplicationActionState);
  return <section className="nj-recruitment"><h2>Orientation and policies</h2><h3>{detail.videoTitle} / {detail.videoVersion}</h3>
    <video key={detail.videoUrl} controls preload="metadata" src={detail.videoUrl} onEnded={() => setEnded(true)} style={{ width: "100%", maxWidth: 800, aspectRatio: "16 / 9", background: "#171717" }} aria-label={detail.videoTitle} />
    <p>{detail.passed ? "Comprehension passed" : `Comprehension attempts: ${detail.attempts} / ${detail.maxAttempts}`}</p>
    {detail.passed && detail.policies.map(policy => <section key={policy.key}><h3>{policy.title} / Version {policy.version}</h3><p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{policy.text}</p></section>)}
    {detail.accepted ? <p role="status">Current policies acknowledged</p> : detail.actionable && (detail.passed || detail.attempts < detail.maxAttempts) && <form action={action} className="nj-form"><fieldset disabled={pending || !!state.success}>
      {!detail.passed && detail.form.fields.map(field => <label key={field.key}>{field.label}{["BOOLEAN", "SELECT", "MULTI_SELECT"].includes(field.type) ? <select name={field.key} required={field.required} multiple={field.type === "MULTI_SELECT"}><option value="">Select</option>{field.type === "BOOLEAN" ? <><option value="true">Yes</option><option value="false">No</option></> : field.options?.map(option => <option key={option}>{option}</option>)}</select> : <input name={field.key} type={field.type === "NUMBER" ? "number" : "text"} required={field.required} maxLength={500} />}</label>)}
      <label className="nj-check"><input type="checkbox" name="acknowledged" required />{detail.passed ? "I have read and agree to all policy versions shown above." : "I completed this orientation video and answered the check myself."}</label>
      <button className="button" disabled={pending || !detail.passed && !ended} type="submit">{pending ? <LoaderCircle size={16} /> : <Check size={16} />}{detail.passed ? "Agree to policies" : "Complete comprehension check"}</button>
    </fieldset>{state.error && <p role="alert">{state.error}</p>}{state.success && <p role="status">{state.success}</p>}</form>}
  </section>;
}
