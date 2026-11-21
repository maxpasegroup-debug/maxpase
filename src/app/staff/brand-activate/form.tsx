"use client";
import { useActionState } from "react";
import { activateBrandEmployee, type BrandActivationState } from "./actions";

export function BrandActivationForm({ challengeId }: { challengeId: string }) {
  const [state, action, pending] = useActionState<BrandActivationState, FormData>(activateBrandEmployee, {});
  return <form action={action} className="business-form"><input type="hidden" name="challengeId" value={challengeId}/><label>Email verification code<input name="code" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} required autoComplete="one-time-code"/></label><label>Create password<input name="password" type="password" minLength={12} maxLength={72} required autoComplete="new-password"/></label><label>Confirm password<input name="confirmPassword" type="password" minLength={12} maxLength={72} required autoComplete="new-password"/></label><p className="muted">The code expires after 24 hours and can only be used once. Your password is yours alone; MAXPASE staff will never ask you to share it.</p>{state.error && <p role="alert" className="error">{state.error}</p>}<button className="button" disabled={pending}>{pending ? "Verifying…" : "Verify and open my dashboard"}</button></form>;
}
