"use client";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { applicationAction, type ApplicationActionState } from "./application-actions";
export type EmployeeField = { name: string; label: string; type?: "text" | "textarea" | "date" | "datetime-local" | "checkbox" | "select"; required?: boolean; value?: string; choices?: { id: string; name: string }[] };
export function EmployeeCommand({ realm, command, label, fields = [] }: { realm: string; command: Record<string, unknown>; label: string; fields?: EmployeeField[] }) {
  return <EmployeeCommandForm key={String(command.idempotencyKey)} realm={realm} command={command} label={label} fields={fields} />;
}
function EmployeeCommandForm({ realm, command, label, fields }: { realm: string; command: Record<string, unknown>; label: string; fields: EmployeeField[] }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(async (s: ApplicationActionState, form: FormData) => {
    const data: Record<string, unknown> = { ...command, confirmed: form.get("confirmed") === "on" };
    for (const field of fields) {
      const value = form.get(field.name);
      if (field.type === "checkbox") data[field.name] = value === "on";
      else if (value) { if (field.name === "evidence") data.evidence = { text: value }; else data[field.name] = field.type === "datetime-local" ? new Date(String(value) + "Z").toISOString() : value; }
    }
    form.set("operation", "EMPLOYEE"); form.set("command", JSON.stringify(data));
    const result = await applicationAction(s, form); if (result.success) router.refresh(); return result;
  }, {});
  return <form action={action} className="nj-form"><input type="hidden" name="realm" value={realm} />
    {fields.map(f => <label key={f.name}>{f.label}{f.type === "textarea" ? <textarea aria-label={f.label} name={f.name} required={f.required} maxLength={f.name === "reason" || f.name === "correctionReason" ? 1000 : 4000} defaultValue={f.value} /> : f.type === "select" ? <select aria-label={f.label} name={f.name} required={f.required} defaultValue={f.value ?? ""}><option value="">Select</option>{f.choices?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select> : <input aria-label={f.label} name={f.name} type={f.type ?? "text"} required={f.required} maxLength={200} defaultValue={f.value} />}</label>)}
    <label><input type="checkbox" name="confirmed" required disabled={pending || !!state.success} /> Confirm {label.toLowerCase()}</label>
    <button className="button" disabled={pending || !!state.success}>{pending ? "Saving..." : label}</button>{state.error && <p role="alert">{state.error}</p>}{state.success && <p role="status">{state.success}</p>}
  </form>;
}
export function WorkerSia({ realm, requestKeys }: { realm: string; requestKeys: string[] }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(async (s: ApplicationActionState, form: FormData) => { const result = await applicationAction(s, form); if (result.response || result.error) router.refresh(); return result; }, {});
  return <section className="nj-worker-sia"><h2>SIA</h2><form action={action} className="nj-form"><input type="hidden" name="realm" value={realm} /><input type="hidden" name="operation" value="EMPLOYEE_SIA" /><input type="hidden" name="idempotencyKey" value={requestKeys[0]} /><label>Ask SIA<textarea name="message" required maxLength={2000} /></label><button className="button" disabled={pending}>{pending ? "Checking work..." : "Ask SIA"}</button></form>
    <div className="nj-quick-actions">{["What should I do first?", "Show my tasks", "What's overdue?", "Help me with this task", "I'm blocked", "Submit today's report", "Show my leads", "Show my follow-ups", "Show my SOP", "Show my resources", "Show my messages", "How am I doing?", "What should I improve?", "What are my current improvement objectives?"].map((q, i) => <form key={q} action={action}><input type="hidden" name="realm" value={realm} /><input type="hidden" name="operation" value="EMPLOYEE_SIA" /><input type="hidden" name="idempotencyKey" value={requestKeys[i + 1]} /><button name="message" value={q} disabled={pending}>{q}</button></form>)}</div>
    {state.error && <p role="alert">{state.error}</p>}{state.response && <div aria-live="polite"><ul>{state.response.actions.map(a => <li key={a}>{a}</li>)}</ul><dl>{state.response.facts.map((f, i) => <div key={i}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}</dl>{state.response.limitations.map(l => <p key={l} className="muted">{l}</p>)}</div>}
  </section>;
}
