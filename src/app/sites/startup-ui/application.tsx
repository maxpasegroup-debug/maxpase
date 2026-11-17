"use client";
import { useActionState, useMemo, useState } from "react";
import { ArrowRight, CircleUserRound, Sparkles } from "lucide-react";
import { startupDraftAction, startupReviewAction, startupSubmitAction, type StartupActionState } from "./actions";

type Answers = { tier?: string; idea?: string; goal?: string; experience?: string; location?: string; timeCommitment?: string };
const steps: { key: keyof Answers; prompt: string; hint: string; type?: "choice" }[] = [
  { key: "tier", prompt: "Which PBA programme are you interested in?", hint: "This records your preference only. It is not an offer or admission.", type: "choice" },
  { key: "idea", prompt: "What problem or business idea would you like to explore?", hint: "A first thought is enough. Please share at least 20 characters." },
  { key: "goal", prompt: "What would you like to learn, test, or build?", hint: "Tell us what a useful outcome would look like for you." },
  { key: "experience", prompt: "What have you tried so far?", hint: "It is completely fine if you are just getting started." },
  { key: "location", prompt: "Where will you begin?", hint: "Share your town, district, or state." },
  { key: "timeCommitment", prompt: "How much time can you give each week?", hint: "A realistic estimate helps the team understand your availability." },
];
const labels: Record<keyof Answers, string> = { tier: "Programme", idea: "Business interest", goal: "Goal", experience: "Experience", location: "Location", timeCommitment: "Weekly time" };
export function StartupApplicationForm({ name, draft }: { name: string; draft: Answers | null }) {
  const [saveState, saveAction, saving] = useActionState(startupDraftAction, {} as StartupActionState);
  const [submitState, submitAction, submitting] = useActionState(startupSubmitAction, {} as StartupActionState);
  const [answers, setAnswers] = useState<Answers>(draft ?? {});
  const [step, setStep] = useState(() => Math.max(0, steps.findIndex(item => !draft?.[item.key])));
  const [reply, setReply] = useState("");
  const [consent, setConsent] = useState(false);
  const [review, setReview] = useState(false);
  const progress = Math.min(100, Math.round((Object.keys(answers).filter(key => answers[key as keyof Answers]).length / steps.length) * 100));
  const current = steps[step];
  const transcript = useMemo(() => steps.slice(0, step).filter(item => answers[item.key]).map(item => ({ prompt: item.prompt, answer: item.key === "tier" ? answers.tier === "PBA_30_DAYS" ? "PBA Starter · 30 days" : "PBA Pro · 180 days" : answers[item.key] ?? "" })), [answers, step]);
  function accept(value: string) {
    if (!current) return;
    const normalized = value.trim();
    const valid = current.key === "tier" ? ["PBA_30_DAYS", "PBA_180_DAYS"].includes(normalized) : normalized.length >= (current.key === "experience" ? 10 : current.key === "location" ? 2 : current.key === "timeCommitment" ? 5 : 20);
    if (!valid) { setReply(normalized); return; }
    const next = { ...answers, [current.key]: normalized };
    setAnswers(next); setReply("");
    const data = new FormData(); data.set("draft", JSON.stringify(next)); saveAction(data);
    if (step < steps.length - 1) setStep(step + 1); else setReview(true);
  }
  function edit(index: number) { setReview(false); setStep(index); setReply(answers[steps[index].key] ?? ""); }
  return <section className="startup-app-card startup-conversation" aria-labelledby="sia-application-title">
    <header className="startup-chat-head"><span className="startup-chat-avatar"><Sparkles size={20}/></span><div><p className="startup-kicker">SIA · AIRA STARTUP SKOOL</p><h2 id="sia-application-title">Let’s talk about your next step.</h2><p>Hi {name}. I’ll guide you through the application. Your answers save as you go.</p></div></header>
    <div className="startup-progress" aria-label={`Application progress ${progress}%`}><span style={{ width: `${progress}%` }}/></div>
    <div className="startup-chat-log" aria-live="polite">
      <p className="startup-chat-note"><strong>SIA</strong><br/>Hi! Welcome to AIRA Startup Skool. I’m SIA, and I’ll help you complete your application. Shall we get started?</p>
      {transcript.map((item, index) => <div className="startup-chat-turn" key={item.prompt}><p className="startup-chat-note"><strong>SIA</strong><br/>{item.prompt}</p><p className="startup-chat-reply"><strong>You</strong><br/>{item.answer}<button type="button" onClick={() => edit(index)} aria-label={`Edit ${labels[steps[index].key]}`}>Edit</button></p></div>)}
      {review ? <div className="startup-chat-review"><p className="startup-kicker">REVIEW YOUR ANSWERS</p><h3>Your application is almost ready.</h3><p>Please check each answer before sending it for human review.</p>{steps.map((item,index)=><div className="startup-review-row" key={item.key}><span><small>{labels[item.key]}</small><br/>{item.key === "tier" ? answers.tier === "PBA_30_DAYS" ? "PBA Starter · 30 days" : "PBA Pro · 180 days" : answers[item.key]}</span><button type="button" onClick={()=>edit(index)}>Edit</button></div>)}<form action={submitAction}><input type="hidden" name="tier" value={answers.tier}/>{steps.filter(item=>item.key!=="tier").map(item=><input key={item.key} type="hidden" name={item.key} value={answers[item.key]??""}/>)}<label className="startup-check"><input type="checkbox" name="consent" checked={consent} onChange={event=>setConsent(event.target.checked)} required/><span>I agree to submit these answers for admissions review. I understand this does not reserve a place, constitute an offer, or create a payment obligation.</span></label>{submitState.error&&<p role="alert" className="startup-error">{submitState.error}</p>}<button className="startup-primary" disabled={submitting||!consent}>{submitting?"Sending application…":"Confirm and send application"}<ArrowRight size={18}/></button></form></div> : current && <div className="startup-chat-current"><p className="startup-chat-note"><strong>SIA</strong><br/>{current.prompt}<small>{current.hint}</small></p>{current.type === "choice" ? <div className="startup-chat-choices"><button type="button" onClick={()=>accept("PBA_30_DAYS")}>PBA Starter <small>30 days</small></button><button type="button" onClick={()=>accept("PBA_180_DAYS")}>PBA Pro <small>180 days</small></button></div> : <form onSubmit={event=>{event.preventDefault();accept(reply)}}><label className="sr-only" htmlFor="sia-reply">Your answer</label><textarea id="sia-reply" value={reply} onChange={event=>setReply(event.target.value)} maxLength={current.key === "idea" || current.key === "goal" ? 1500 : current.key === "experience" ? 1000 : 250} placeholder="Type your answer…" rows={3}/><div className="startup-chat-controls"><span>{saveState.error ?? (saving ? "Saving…" : saveState.message ?? "Draft saves securely to your account")}</span><button className="startup-primary" type="submit">Continue <ArrowRight size={17}/></button></div></form>}{saveState.error&&<p role="alert" className="startup-error">{saveState.error}</p>}</div>}
    </div>
    <p className="startup-chat-disclaimer"><CircleUserRound size={15}/> SIA provides guided application help. A human team member reviews applications. SIA does not decide admission or promise outcomes.</p>
  </section>;
}
export function StartupReviewForm({ id, version }: { id: string; version: number }) {
  const [state, action, pending] = useActionState(startupReviewAction, {} as StartupActionState);
  return <form action={action} className="startup-review-form" aria-busy={pending}><input type="hidden" name="id" value={id}/><input type="hidden" name="version" value={version}/><label>Decision<select name="decision" required defaultValue=""><option value="" disabled>Choose a decision</option><option value="IN_REVIEW">Begin review</option><option value="APPROVED">Approve application</option><option value="REJECTED">Reject application</option></select></label><label>Decision reason<textarea name="reason" minLength={5} maxLength={1000} required rows={2}/></label><p className="startup-help">Approval records an admissions decision only. It does not enrol the applicant or accept payment.</p>{state.error && <p role="alert" className="startup-error">{state.error}</p>}<button className="startup-secondary" disabled={pending}>{pending ? "Recording..." : "Record decision"}</button></form>;
}
