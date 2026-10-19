"use client";
import { startTransition, useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { applicationAction, type ApplicationActionState } from "./application-actions";

type Framework = { id: string; number: number; definition: { name: string; period: string; timezone: string } };
type Props = { realm: string; requestId: string; workers: { id: string; name: string }[]; frameworks: Framework[]; correction?: { id: string; assignmentId: string; frameworkVersionId: string; start: string; end: string } };
export function PerformanceSnapshotForm(props: Props) { return <SnapshotForm key={props.requestId} {...props} />; }
function SnapshotForm({ realm, requestId, workers, frameworks, correction }: Props) {
  const router = useRouter(), [selected, setSelected] = useState(correction?.frameworkVersionId ?? "");
  const framework = frameworks.find(f => f.id === selected), custom = framework?.definition.period === "CUSTOM";
  const [state, action, pending] = useActionState(async (s: ApplicationActionState, f: FormData) => {
    try {
      const from = String(f.get("from")), until = String(f.get("until"));
      const c = { operation: "SNAPSHOT", confirmed: f.get("confirmed") === "on", idempotencyKey: requestId, assignmentId: f.get("assignmentId"), frameworkVersionId: f.get("frameworkVersionId"), from: custom ? new Date(from + "Z").toISOString() : from, until: custom ? new Date(until + "Z").toISOString() : until, ...(correction ? { supersedesId: correction.id, reason: f.get("reason") } : {}) };
      f.set("operation", "PERFORMANCE"); f.set("command", JSON.stringify(c)); const result = await applicationAction(s, f); if (result.success) router.refresh(); return result;
    } catch { return { error: "Check the period boundaries." }; }
  }, {});
  const original = (value?: string) => value ? custom ? value.slice(0, 19) : new Intl.DateTimeFormat("en-CA", { timeZone: framework?.definition.timezone ?? "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value)) : undefined;
  return <form className="nj-form" onSubmit={e => { e.preventDefault(); if (pending || state.success) return; const f = new FormData(e.currentTarget); startTransition(() => action(f)); }}><input type="hidden" name="realm" value={realm} /><label>Worker<select name="assignmentId" aria-label="Worker" required defaultValue={correction?.assignmentId ?? ""}><option value="">Select</option>{workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label><label>Published framework version<select name="frameworkVersionId" aria-label="Published framework version" required value={selected} onChange={e => setSelected(e.currentTarget.value)}><option value="">Select</option>{frameworks.map(f => <option key={f.id} value={f.id}>{f.definition.name} / v{f.number}</option>)}</select></label>{framework && <div key={selected}><label>Period start ({custom ? "UTC" : framework.definition.timezone})<input type={custom ? "datetime-local" : "date"} name="from" aria-label="Period start" required step={custom ? "1" : undefined} defaultValue={original(correction?.start)} /></label><label>Period end, exclusive ({custom ? "UTC" : framework.definition.timezone})<input type={custom ? "datetime-local" : "date"} name="until" aria-label="Period end" required step={custom ? "1" : undefined} defaultValue={original(correction?.end)} /></label></div>}{correction && <label>Correction reason<textarea name="reason" required maxLength={2000} /></label>}<label><input name="confirmed" type="checkbox" required disabled={pending || !!state.success} /> Confirm {correction ? "historical correction" : "snapshot generation"}</label><button className="button" disabled={pending || !!state.success}>{pending ? "Generating..." : correction ? "Generate correction" : "Generate snapshot"}</button>{state.error && <p role="alert">{state.error}</p>}{state.success && <p role="status">{state.success}</p>}</form>;
}
