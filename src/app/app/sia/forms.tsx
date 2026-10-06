"use client";
import { useActionState, useState } from "react";
import { Send, Check, Plus, Save, ShieldCheck } from "lucide-react";
import { siaAction, type SiaState } from "./actions";
import type { Selection } from "@/server/sia/context";
import type { SiaResponse } from "@/server/sia/registry";
import { UserTime } from "@/components/ui/user-time";
function ContextFields({ selection, mode }: { selection: Selection; mode: string }) { return <><input type="hidden" name="siaId" value={selection.siaId}/><input type="hidden" name="organizationId" value={selection.organizationId}/><input type="hidden" name="projectId" value={selection.projectId ?? ""}/><input type="hidden" name="mode" value={mode}/></>; }
export function Response({ response: r }: { response: SiaResponse }) {
  const graph = r.context.graph as { nodes: { id: string; type: string; name: string }[]; edges: { from: string; to: string; type: string }[] } | undefined;
  const memory = r.context.memory as { id: string; category: string; value: string; sourceType: string; sourceId: string | null; confidence: number | null }[] | undefined;
  const briefing = r.context.briefing as { date: string; changes: { id: string; title: string; href: string }[]; deadlines: { id: string; title: string; href: string }[]; wins: { id: string; title: string; href: string }[] } | null;
  const decisionDetails = r.context.decisionDetails as { id: string; question: string; context: string; impact: string | null; options: string[]; humanRecommendation: string | null; decisionMaker: string | null; nextAction: string }[] | undefined;
  return <div className="sia-response" aria-live="polite"><p className="muted">{r.provider} / <UserTime value={r.calculatedAt}/></p>
    {briefing && <section><h2>Today / {briefing.date} UTC</h2><div className="sia-facts">{(["changes", "deadlines", "wins"] as const).map(k => <div key={k}><h3>{k[0].toUpperCase() + k.slice(1)}</h3>{briefing[k].length ? briefing[k].map(i => <p key={i.id}><a href={i.href}>{i.title}</a></p>) : <p className="muted">No matching authorized records.</p>}</div>)}</div></section>}
    <section><h2>Facts</h2>{r.facts.length ? <dl className="sia-facts">{r.facts.map((f, i) => <div key={i}><dt>{f.label}</dt><dd>{f.value ?? "Unavailable"}<small>{f.source}</small></dd></div>)}</dl> : <p className="muted">No matching facts.</p>}</section>
    <section><h2>Signals</h2>{r.signals.length ? r.signals.map(s => <div className="sia-row" key={s.id + s.explanation}><div><strong>{s.title}</strong><p>{s.explanation}</p><p className="muted">Owner: {s.owner ?? "Unavailable"}</p><a href={s.href}>{s.nextAction}</a></div><span className="badge">{s.severity}</span></div>) : <p className="muted">No matching authorized signals.</p>}</section>
    <section><h2>Recommendations</h2>{r.recommendations.map((v, i) => <div className="sia-row" key={i}><div><strong>{v.recommendation}</strong><p>{v.interpretation}</p><p className="muted">Evidence: {v.evidence.join(", ")} / {v.confidence}</p><p>{v.expectedBenefit}. {v.risk}.</p></div></div>)}{!r.recommendations.length && <p className="muted">No evidence-backed recommendation.</p>}</section>
    <section><h2>Actions</h2>{r.actions.length ? r.actions.map(a => <p key={a}>{a}</p>) : <p className="muted">No business action executed.</p>}</section>
    <section><h2>Approvals</h2>{r.approvals.length ? r.approvals.map(a => <div className="sia-row" key={a.id}><a href={a.href}>{a.title}</a><span className="badge">{a.status}</span></div>) : <p className="muted">No matching authorized pending decisions.</p>}</section>
    {!!decisionDetails?.length && <section><h2>Decision context</h2>{decisionDetails.map(d => <div className="sia-row" key={d.id}><div><strong>{d.question}</strong><p>{d.context}</p><p>Impact: {d.impact ?? "Unspecified"}</p><p>Decision maker: {d.decisionMaker ?? "Unavailable"}</p>{!!d.options.length && <ul>{d.options.map(o => <li key={o}>{o}</li>)}</ul>}{d.humanRecommendation && <p>Recorded human recommendation: {d.humanRecommendation}</p>}<p className="muted">{d.nextAction}</p></div></div>)}</section>}
    {graph && <details><summary>Business context ({graph.nodes.length} entities)</summary><ul>{graph.nodes.map(n => <li key={n.id}>{n.type}: {n.name}</li>)}</ul><p className="muted">{graph.edges.length} authorized relationships</p></details>}
    {!!memory?.length && <details><summary>Reviewed memory</summary>{memory.map(m => <p key={m.id}><strong>{m.category}</strong>: {m.value}<small>{m.sourceType} {m.sourceId} / confidence {m.confidence ?? "unassessed"}</small></p>)}</details>}
    <aside className="sia-limitations">{r.limitations.map(l => <p key={l}>{l}</p>)}</aside>
  </div>;
}
export function Composer({ selection, requestKey }: { selection: Selection; requestKey: string }) {
  const [state, action, pending] = useActionState<SiaState, FormData>(siaAction, {});
  const [key, setKey] = useState(requestKey);
  return <><form action={action} className="sia-composer"><ContextFields selection={selection} mode="conversation"/><input type="hidden" name="idempotencyKey" value={key}/><label htmlFor="sia-message">Executive request</label><div><textarea id="sia-message" name="message" onChange={() => setKey(crypto.randomUUID())} maxLength={2000} required rows={3}/><button className="button" disabled={pending} title="Send request" aria-label="Send request"><Send size={18}/></button></div>{pending && <p role="status">Retrieving authorized evidence...</p>}{state.error && <p className="form-error" role="alert">{state.error}</p>}</form>{state.response && <Response response={state.response}/>}</>;
}
export function MutationForm({ selection, mode, children, label = "Save", icon = "save" }: { selection: Selection; mode: string; children: React.ReactNode; label?: string; icon?: "save" | "check" | "plus" | "shield" }) {
  const [state, action, pending] = useActionState<SiaState, FormData>(siaAction, {});
  const Icon = icon === "check" ? Check : icon === "plus" ? Plus : icon === "shield" ? ShieldCheck : Save;
  return <form action={action} className="sia-form"><ContextFields selection={selection} mode={mode}/>{children}<button className="button secondary" disabled={pending} title={label}><Icon size={16}/>{label}</button>{state.error && <p role="alert" className="form-error">{state.error}</p>}{state.success && <p role="status">{state.success}</p>}</form>;
}
