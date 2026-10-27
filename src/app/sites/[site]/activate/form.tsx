"use client";
import { useActionState } from "react";
import Link from "next/link";
import { activateStaffAction, type ActivationState } from "./actions";

export function StaffActivationForm({ challengeId, login, site }: { challengeId: string; login: string; site: "skillcity" | "labs" }) {
  const [state, action, pending] = useActionState(activateStaffAction, {} as ActivationState);
  return <form action={action} className="business-form"><input type="hidden" name="challengeId" value={challengeId}/><input type="hidden" name="site" value={site}/>
    <label>Six-digit email code<input name="code" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} autoComplete="one-time-code" required/></label>
    <label>New password<input name="password" type="password" minLength={12} maxLength={72} autoComplete="new-password" required/></label>
    <label>Confirm password<input name="confirmPassword" type="password" minLength={12} maxLength={72} autoComplete="new-password" required/></label>
    {state.error && <p role="alert" className="error">{state.error}</p>}
    {state.message && <p role="status">{state.message} <Link href={login}>Sign in</Link></p>}
    <button disabled={pending || !!state.message}>{pending ? "Activating..." : "Activate account"}</button>
  </form>;
}
