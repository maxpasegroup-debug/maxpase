"use client";
import { useActionState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, KeyRound, MailCheck } from "lucide-react";
import { jobsEmailLoginAction, jobsPasswordResetAction, type PortalLoginState } from "./actions";

export function JobsCodeFields({ challengeId }: { challengeId: string }) {
  return <><input type="hidden" name="step" value="VERIFY" /><input type="hidden" name="challengeId" value={challengeId} /><label>Email verification code<input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required /></label></>;
}
export function JobsEmailAuthForm({ paths, reset = false, versionId }: { paths: { home: string; login: string; signup: string }; reset?: boolean; versionId?: string }) {
  const [state, action, pending] = useActionState(reset ? jobsPasswordResetAction : jobsEmailLoginAction, {} as PortalLoginState);
  const selected = versionId ? `?versionId=${encodeURIComponent(versionId)}` : "";
  return <main className="portal-login portal-jobs">
    <Link className="portal-wordmark" href={paths.home}>Nice Jobs<span>AIRA CAREER HUB</span></Link>
    <section className="portal-login-panel">{reset ? <KeyRound size={28} /> : <MailCheck size={28} />}<h1>{reset ? "Reset your password" : state.challengeId ? "Check your email" : "Welcome back"}</h1>
      {state.message && <p role="status">{state.message}</p>}
      {!state.complete && <form action={action} className="form-stack" aria-busy={pending}>
        {versionId && <input type="hidden" name="versionId" value={versionId} />}
        <fieldset disabled={pending}>
          {state.challengeId ? <JobsCodeFields challengeId={state.challengeId} /> : <label>Email<input name="email" type="email" autoComplete="username" maxLength={254} required /></label>}
          {(!reset && !state.challengeId || reset && state.challengeId) && <label>{reset ? "New password" : "Password"}<input name="password" type="password" autoComplete={reset ? "new-password" : "current-password"} minLength={reset ? 12 : 8} maxLength={72} required /></label>}
          {reset && state.challengeId && <label>Confirm new password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={72} required /></label>}
          <button className="portal-button" disabled={pending}>{pending ? "Please wait..." : state.challengeId ? reset ? "Change password" : "Verify and sign in" : "Send email code"}<ArrowRight size={18} /></button>
        </fieldset>
        {state.error && <p role="alert" className="error">{state.error}</p>}
      </form>}
      {state.challengeId && <p><a href={(reset ? paths.login.replace(/\/login$/, "/reset-password") : paths.login) + selected}>Start again / request a new code</a></p>}
      {reset ? <p><Link href={paths.login + selected}>Back to sign in</Link></p> : <><p><Link href={paths.login.replace(/\/login$/, "/reset-password")}>Forgot password?</Link></p><p>New here? <Link href={paths.signup + selected}>Create an applicant account</Link></p></>}
    </section><Link className="portal-back" href={paths.home}><ArrowLeft size={16} />Back to Nice Jobs</Link>
  </main>;
}
