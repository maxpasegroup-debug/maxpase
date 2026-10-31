"use client";
import { useActionState, useState } from "react";
import { ArrowRight } from "lucide-react";
import { SiaMascot } from "@/components/sia/sia-mascot";
import { startupReviewAction, startupSubmitAction, type StartupActionState } from "./actions";

const prompts: Record<string, string> = {
  idea: "Start with the person you want to help and the problem you notice. A rough idea is enough.",
  goal: "What would you like to test or build during this journey? Small, concrete steps are useful.",
  experience: "Tell us what you have already tried. Being new to business is okay.",
  location: "Where will you begin? We are starting in Kerala, and will review availability elsewhere.",
  timeCommitment: "How much time can you realistically give each week?"
};
export function StartupApplicationForm() {
  const [state, action, pending] = useActionState(startupSubmitAction, {} as StartupActionState);
  const [focus, setFocus] = useState("idea");
  return <section className="startup-app-card"><p className="startup-kicker">STEP 2 OF 3 · SIA GUIDED</p><h2>Tell us about your journey.</h2><p>Your answers help a human reviewer understand your starting point. Choose a tier you are interested in; this is not an offer or payment request.</p><div className="startup-guide"><SiaMascot className="sia-inline-mascot"/><span><strong>SIA asks:</strong> {prompts[focus]}</span></div><form action={action} className="startup-form" aria-busy={pending}><label>Which PBA path interests you?<select name="tier" defaultValue="" required><option value="" disabled>Choose a path</option><option value="STARTER">Starter · 1 month · 1 business model</option><option value="PRO">Pro · 3 months · 2 business models</option><option value="EXTRAORDINARY">Extraordinary Entrepreneur · 6 months · 3 or more models</option></select></label><label>Your idea or problem to solve<textarea name="idea" minLength={20} maxLength={1500} rows={3} onFocus={() => setFocus("idea")} required/></label><label>What would you like to achieve?<textarea name="goal" minLength={20} maxLength={1500} rows={3} onFocus={() => setFocus("goal")} required/></label><label>What have you tried so far?<textarea name="experience" minLength={10} maxLength={1000} rows={3} onFocus={() => setFocus("experience")} required/></label><div className="startup-form-pair"><label>Where will you begin?<input name="location" maxLength={120} onFocus={() => setFocus("location")} required/></label><label>Time you can give each week<input name="timeCommitment" maxLength={250} onFocus={() => setFocus("timeCommitment")} required/></label></div><label className="startup-check"><input name="consent" type="checkbox" required/><span>I agree to submit these answers for Startup Skool admissions review. I understand this does not reserve a place or create a payment obligation.</span></label>{state.error && <p role="alert" className="startup-error">{state.error}</p>}<button className="startup-primary" disabled={pending}>{pending ? "Sending..." : "Send for human review"}<ArrowRight size={18}/></button></form></section>;
}
export function StartupReviewForm({ id, version }: { id: string; version: number }) {
  const [state, action, pending] = useActionState(startupReviewAction, {} as StartupActionState);
  return <form action={action} className="startup-review-form" aria-busy={pending}><input type="hidden" name="id" value={id}/><input type="hidden" name="version" value={version}/><label>Decision<select name="decision" required defaultValue=""><option value="" disabled>Choose a decision</option><option value="IN_REVIEW">Begin review</option><option value="APPROVED">Approve application</option><option value="REJECTED">Reject application</option></select></label><label>Decision reason<textarea name="reason" minLength={5} maxLength={1000} required rows={2}/></label><p className="startup-help">Approval records an admissions decision only. It does not enrol the applicant or accept payment.</p>{state.error && <p role="alert" className="startup-error">{state.error}</p>}<button className="startup-secondary" disabled={pending}>{pending ? "Recording..." : "Record decision"}</button></form>;
}
