"use client";
import { useActionState, useState } from "react";
import { Sparkles, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { applicationAction, type ApplicationActionState } from "./application-actions";

export function ApplicantSiaGuide({ realm, reference, available, idempotencyKey }: { realm: string; reference: string; available: boolean; idempotencyKey: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("Help me complete this application");
  const [state, action, pending] = useActionState(async (previous: ApplicationActionState, form: FormData) => {
    const result = await applicationAction(previous, form);
    if (result.response) { setRequestKey(crypto.randomUUID()); router.refresh(); }
    return result;
  }, {} as ApplicationActionState);
  const [requestKey, setRequestKey] = useState(idempotencyKey);
  return <section className="nj-applicant-guide"><h2><Sparkles size={20} /> TARA application guide</h2>{available ? <><p>Ask about this job application. TARA currently supports the suggested questions below and reads only your authorized record.</p><form action={action} className="nj-form" aria-busy={pending}><input type="hidden" name="realm" value={realm} /><input type="hidden" name="operation" value="APPLICANT_SIA" /><input type="hidden" name="reference" value={reference} /><input type="hidden" name="idempotencyKey" value={requestKey} /><label>Your message<textarea name="message" value={message} onChange={event => setMessage(event.target.value)} required maxLength={2000} disabled={pending} /></label><div className="nj-quick-actions">{["Help me complete this application", "Explain the application questions", "What happens after I submit?", "Show the published opportunity terms"].map(prompt => <button key={prompt} type="button" onClick={() => setMessage(prompt)} disabled={pending}>{prompt}</button>)}</div><button className="button" disabled={pending}>{pending ? <LoaderCircle size={16} /> : <Sparkles size={16} />}{pending ? "Preparing guidance..." : "Ask TARA"}</button>{state.error && <p role="alert">{state.error}</p>}{state.response && <p role="status">TARA guidance was recorded below. Review the current application before acting.</p>}</form></> : <p>TARA assistance is not enabled for your account yet. You can complete the guided questions below.</p>}</section>;
}
