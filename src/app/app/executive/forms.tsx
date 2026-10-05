"use client";
import { useActionState, useState } from "react";
import { Check, Save, Plus, Filter } from "lucide-react";
import { executiveAction } from "./actions";
type Choice = { id: string; name: string };
export function ExecutiveFilterPanel({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return <div><button className="executive-filter-toggle button secondary" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="executive-scope-filters"><Filter size={16} /> Scope &amp; filters</button><div id="executive-scope-filters" className={`executive-filter-panel${open ? " is-open" : ""}`}>{children}</div></div>;
}
export function ExecutiveAction({ children }: { children: React.ReactNode }) {
  const [state, action, pending] = useActionState(executiveAction, {});
  return <form action={action} className="executive-action"><fieldset disabled={pending}>{children}<button className="icon-button" type="submit" title="Save action" aria-label="Save action"><Check size={18} /></button></fieldset>{state.error && <p role="alert">{state.error}</p>}{state.success && <p role="status">{state.success}</p>}</form>;
}
export function ExecutiveEditor({ kind, organizations, projects, people, organizationGrants }: { kind: string; organizations: Choice[]; projects: (Choice & { organizationId: string })[]; people: Choice[]; organizationGrants: string[] }) {
  const [state, action, pending] = useActionState(executiveAction, {}), [open, setOpen] = useState(false), [id, setId] = useState("");
  const [scope, setScope] = useState(organizations[0]?.id ?? "");
  return <section className="editor-band"><button className="button secondary" onClick={() => { if (!open) setId(crypto.randomUUID()); setOpen(!open); }} aria-expanded={open}><Plus size={16} /> New {kind.toLowerCase()}</button>{open && <form action={action} className="business-form">
    <input type="hidden" name="action" value="create" /><input type="hidden" name="kind" value={kind} /><input type="hidden" name="reference" value={id} />
    <label>Scope<select name="organizationId" required value={scope} onChange={e => setScope(e.target.value)}>{organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
    <label>Project<select name="projectId" required={!organizationGrants.includes(scope)} key={scope}><option value="">{organizationGrants.includes(scope) ? "None" : "Select project"}</option>{projects.filter(p => p.organizationId === scope).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    <label>{kind === "DECISION" ? "Decision maker" : "Owner"}<select name="ownerPersonId" required><option value="">Select person</option>{people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    <label>Title<input name="title" required maxLength={200} /></label><label>Description / why<textarea name="description" required maxLength={4000} /></label><label>Needed by (UTC)<input name="dueAt" type="date" /></label>
    {kind === "DECISION" && <><label>Impact<textarea name="impact" required /></label><label>Options<textarea name="options" /></label><label>Human recommendation<textarea name="recommendedAction" /></label></>}
    {kind === "KPI" && <><label>Target<input type="number" name="target" step="any" required /></label><label>Unit<input name="unit" required /></label><label>Preferred direction<select name="direction"><option value="HIGHER">Higher</option><option value="LOWER">Lower</option></select></label><label>Period start (UTC)<input type="date" name="periodStart" required /></label><label>Period end (UTC)<input type="date" name="periodEnd" required /></label><label>Attested source<textarea name="source" required /></label></>}
    {kind === "RISK" && <><label>Severity<select name="severity">{["LOW", "MEDIUM", "HIGH", "CRITICAL"].map(s => <option key={s}>{s}</option>)}</select></label><label>Probability<input type="number" name="probability" min={0} max={1} step={0.01} /></label><label>Mitigation<textarea name="mitigation" /></label><label>Source<textarea name="source" /></label></>}
    {kind === "OPPORTUNITY" && <><label>Potential impact<textarea name="impact" required /></label><label>Next action<textarea name="nextAction" required /></label><label>Source<textarea name="source" /></label></>}
    <button className="button" type="submit" disabled={pending}><Save size={16} /> Save</button>{state.error && <p role="alert">{state.error}</p>}{state.success && <p role="status">{state.success}</p>}
  </form>}</section>;
}
