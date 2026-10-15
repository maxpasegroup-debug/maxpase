"use client";
import { useActionState } from "react";
import Link from "next/link";
import { niceJobsControlRecordHref } from "@/lib/nicejobs-control-navigation";
import { applicationAction, type ApplicationActionState } from "./application-actions";
export function BossSia({ realm, base, companyId, divisionId, requestKey,training=false }: { realm: string; base: string; companyId: string; divisionId: string | null; requestKey: string;training?:boolean }) {
  const [state, action, pending] = useActionState<ApplicationActionState, FormData>(applicationAction, {});
  return <section className="nj-boss-assistance"><h2>SIA preparation</h2><form action={action}>
    <input type="hidden" name="realm" value={realm} /><input type="hidden" name="operation" value="BOSS_SIA" />
    <input type="hidden" name="companyId" value={companyId} /><input type="hidden" name="divisionId" value={divisionId ?? ""} /><input type="hidden" name="idempotencyKey" value={requestKey} />{training && <input type="hidden" name="purpose" value="TRAINING"/>}
    <button className="button" disabled={pending}>{pending ? "Preparing..." : "Prepare review plan"}</button>
  </form>{state.error && <p role="alert">{state.error}</p>}{state.response && <div role="status">
    <p>Read-only preparation / {state.response.provider} / {state.response.calculatedAt}</p>
    <p>Run: {String(state.response.context.runId ?? "Unavailable")} / Audit: {String(state.response.context.auditId ?? "Unavailable")}</p>
    <ol>{state.response.actions.map((item, index) => <li key={index}>{item}</li>)}</ol>
    <ul>{state.response.signals.map(s => { const href = niceJobsControlRecordHref(base, s.href, companyId); return <li key={s.id}><strong>{s.title}</strong><p>{s.explanation}</p>{href ? <Link href={href}>{s.nextAction}</Link> : <p>{s.nextAction}</p>}</li>; })}</ul>
    {state.response.recommendations.map((r, index) => <article key={index}><h3>{r.observation}</h3><p>{r.recommendation}</p><p>Evidence: {r.evidence.join(" / ")}</p><p>{r.risk}</p></article>)}
    {state.response.limitations.map(item => <p key={item}>{item}</p>)}
  </div>}</section>;
}
