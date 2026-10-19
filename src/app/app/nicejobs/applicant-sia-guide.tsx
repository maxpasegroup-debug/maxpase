"use client";
import { useActionState, useState } from "react";
import { Sparkles, LoaderCircle } from "lucide-react";
import { applicationAction, type ApplicationActionState } from "./application-actions";

export function ApplicantSiaGuide({ realm, reference, available, idempotencyKey }: { realm: string; reference: string; available: boolean; idempotencyKey: string }) {
  const [state, action, pending] = useActionState(applicationAction, {} as ApplicationActionState);
  const [requestKey, setRequestKey] = useState(idempotencyKey);
  return <section className="nj-applicant-guide"><h2><Sparkles size={20} /> SIA application guide</h2>{available ? <><form action={action} className="nj-form" aria-busy={pending}><input type="hidden" name="realm" value={realm} /><input type="hidden" name="operation" value="APPLICANT_SIA" /><input type="hidden" name="reference" value={reference} /><input type="hidden" name="idempotencyKey" value={requestKey} /><label>What would you like help with?<select name="message" disabled={pending} onChange={() => setRequestKey(crypto.randomUUID())} defaultValue="Help me complete this application"><option>Help me complete this application</option><option>Explain the application questions</option><option>What happens after I submit?</option><option>Show the published opportunity terms</option></select></label><button className="button" disabled={pending}>{pending ? <LoaderCircle size={16} /> : <Sparkles size={16} />}{pending ? "Preparing guidance..." : "Ask SIA"}</button>{state.error && <p role="alert">{state.error}</p>}</form>{state.response && <div role="status"><dl className="nj-detail">{state.response.facts.map((fact, index) => <div key={index}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl><ul>{state.response.actions.map(action => <li key={action}>{action}</li>)}</ul><p>{state.response.limitations[0]}</p></div>}</> : <p>SIA assistance is not enabled for your account yet. You can complete the guided questions below.</p>}</section>;
}
