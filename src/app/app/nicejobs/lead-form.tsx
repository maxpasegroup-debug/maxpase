"use client";
import { startTransition, useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { applicationAction, type ApplicationActionState } from "./application-actions";
import type { EmployeeField } from "./employee-form";
export type LeadField = Omit<EmployeeField, "type"> & { type?: EmployeeField["type"] | "multiple" | "keys" };
export function LeadCommand(props: { realm: string; command: Record<string, unknown>; label: string; actionType?: "LEAD" | "KNOWLEDGE" | "PERFORMANCE" | "FINANCE" | "GOAL_PLAN"; fields?: LeadField[] }) { return <LeadForm key={String(props.command.idempotencyKey)} {...props} />; }
function LeadForm({ realm, command, label, actionType = "LEAD", fields = [] }: { realm: string; command: Record<string, unknown>; label: string; actionType?: "LEAD" | "KNOWLEDGE" | "PERFORMANCE" | "FINANCE" | "GOAL_PLAN"; fields?: LeadField[] }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string | string[] | boolean>>(() => Object.fromEntries(fields.map(f => [f.name, f.type === "checkbox" ? false : f.type === "multiple" ? [] : f.value ?? ""])));
  const update = (name: string, value: string | string[] | boolean) => setValues(current => ({ ...current, [name]: value }));
  const [state, action, pending] = useActionState(async (s: ApplicationActionState, form: FormData) => {
    const data = { ...command, confirmed: form.get("confirmed") === "on" } as Record<string, unknown>;
    for (const f of fields) { const v = form.get(f.name); if (f.type === "checkbox") data[f.name] = v === "on"; else if (f.type === "multiple") data[f.name] = form.getAll(f.name); else if (f.type === "keys") data[f.name] = String(v ?? "").split(",").map(k => k.trim()).filter(Boolean); else if (v) { const value = f.type === "datetime-local" ? new Date(String(v) + "Z").toISOString() : v; if (f.name.startsWith("nextFollowup.")) { const nested = data.nextFollowup as Record<string, unknown> | undefined; data.nextFollowup = { ...nested, [f.name.split(".")[1]]: value }; } else data[f.name] = value; } }
    if (data.nextFollowup && !(data.nextFollowup as Record<string, unknown>).scheduledAt) delete data.nextFollowup;
    if (s.duplicates && form.get("duplicateConfirmed") === "on") data.duplicateDecision = { token: s.duplicates.token, reason: form.get("duplicateReason") };
    form.set("operation", actionType); form.set("command", JSON.stringify(data));
    const result = await applicationAction(s, form); if (result.success) router.refresh(); return result;
  }, {});
  return <form onSubmit={event => { event.preventDefault(); if (pending || state.success) return; const form = new FormData(event.currentTarget); startTransition(() => action(form)); }} className="nj-form"><input type="hidden" name="realm" value={realm} />{fields.map(f => <label key={f.name}>{f.label}{f.type === "textarea" ? <textarea aria-label={f.label} name={f.name} required={f.required} maxLength={4000} value={String(values[f.name])} onChange={e => update(f.name, e.currentTarget.value)} /> : f.type === "select" || f.type === "multiple" ? <select aria-label={f.label} name={f.name} required={f.required} multiple={f.type === "multiple"} value={values[f.name] as string | string[]} onChange={e => update(f.name, f.type === "multiple" ? Array.from(e.currentTarget.selectedOptions, option => option.value) : e.currentTarget.value)}>{f.type !== "multiple" && <option value="">Select</option>}{f.choices?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select> : f.type === "checkbox" ? <input aria-label={f.label} name={f.name} type="checkbox" required={f.required} checked={Boolean(values[f.name])} onChange={e => update(f.name, e.currentTarget.checked)} /> : <input aria-label={f.label} name={f.name} type={f.type === "keys" ? "text" : f.type ?? "text"} required={f.required} value={String(values[f.name])} onChange={e => update(f.name, e.currentTarget.value)} maxLength={1000} />}</label>)}
    {state.duplicates && <fieldset><legend>Matching contacts</legend><ul>{state.duplicates.matches.map(m => <li key={m.id}>{m.name}</li>)}</ul><label><input name="duplicateConfirmed" type="checkbox" required /> Create a separate lead after reviewing these contacts</label><label>Reason<input name="duplicateReason" required maxLength={1000} /></label></fieldset>}
    <label><input name="confirmed" type="checkbox" required disabled={pending || !!state.success} /> Confirm {label.toLowerCase()}</label><button className="button" disabled={pending || !!state.success}>{pending ? "Saving..." : label}</button>{state.error && <p role="alert">{state.error}</p>}{state.success && <p role="status">{state.success}</p>}
  </form>;
}
