"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { jobsEmailLoginAction, jobsPasswordResetAction, type PortalLoginState } from "./actions";
import { JobsAuthShell, type JobsAuthPaths } from "../jobs-ui/auth-shell";
import { PasswordField } from "../jobs-ui/password-field";
import styles from "../jobs-ui/auth.module.css";

export function JobsCodeFields({ challengeId }: { challengeId: string }) {
  return <><input type="hidden" name="step" value="VERIFY" /><input type="hidden" name="challengeId" value={challengeId} /><div className={styles.field}><label htmlFor="jobs-code">Six-digit email code</label><input id="jobs-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required /><p className={styles.hint}>The code expires in 10 minutes and can be used once.</p></div></>;
}

export function JobsEmailAuthForm({ paths, reset = false, versionId }: { paths: JobsAuthPaths; reset?: boolean; versionId?: string }) {
  const [state, action, pending] = useActionState(reset ? jobsPasswordResetAction : jobsEmailLoginAction, {} as PortalLoginState);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [attempted, setAttempted] = useState(false);
  const mismatch = confirmation.length > 0 && password !== confirmation;
  const selected = versionId ? `?versionId=${encodeURIComponent(versionId)}` : "";
  const resetPath = paths.login.replace(/\/login$/, "/reset-password");
  const verifying = Boolean(state.challengeId);
  const title = state.complete ? "Password changed." : reset ? verifying ? "Set a new password." : "Reset your password." : verifying ? "Check your email." : "Welcome back.";
  const description = state.complete ? "Your other sessions have been signed out. Sign in again with your new password." : reset ? verifying ? "Enter the code from your email, then choose a new password." : "Enter your account email to request a reset code." : verifying ? "Enter the six-digit code to finish signing in." : "Sign in to continue your Nice Jobs journey.";
  return <JobsAuthShell paths={paths} mode={reset ? "reset" : verifying ? "verify" : "login"} eyebrow={reset ? "ACCOUNT RECOVERY" : verifying ? "EMAIL VERIFICATION" : "YOUR ACCOUNT"} title={title} description={description}>
    {state.message && <p role="status" className={styles.status}>{state.message}</p>}
    {!state.complete && <form action={action} className={styles.form} aria-busy={pending} onSubmit={event => { if (reset && verifying && password !== confirmation) { event.preventDefault(); setAttempted(true); } }}>
      {versionId && <input type="hidden" name="versionId" value={versionId} />}
      <fieldset disabled={pending}>
        {verifying ? <JobsCodeFields challengeId={state.challengeId!} /> : <div className={styles.field}><label htmlFor="jobs-email">Email address</label><input id="jobs-email" name="email" type="email" autoComplete="username" maxLength={254} required /></div>}
        {!reset && !verifying && <PasswordField />}
        {reset && verifying && <><PasswordField label="New password" autoComplete="new-password" minLength={12} hint="Use at least 12 characters." onChange={event => setPassword(event.target.value)} /><PasswordField name="confirmPassword" label="Confirm new password" autoComplete="new-password" minLength={12} invalid={mismatch || attempted && password !== confirmation} onChange={event => setConfirmation(event.target.value)} />{(mismatch || attempted && password !== confirmation) && <p role="alert" className={styles.inlineError}>Passwords do not match.</p>}</>}
        <button className={styles.button} disabled={pending}>{pending ? "Please wait..." : verifying ? reset ? "Change password" : "Verify and sign in" : reset ? "Request reset code" : "Continue to email code"}<ArrowRight size={18} /></button>
      </fieldset>
      {state.error && <p role="alert" className={styles.alert}>{state.error}</p>}
    </form>}
    {state.complete ? <p className={styles.switch}><Link href={paths.login + selected}>Sign in with your new password <ArrowRight size={16} /></Link></p> : <>
      {verifying && <p className={styles.switch}><Link href={(reset ? resetPath : paths.login) + selected}>Start again or request a new code</Link></p>}
      {reset ? <p className={styles.switch}><Link href={paths.login + selected}>Back to sign in</Link></p> : <><p className={styles.supportLink}><Link href={resetPath + selected}>Forgot password?</Link></p><p className={styles.switch}>New to Nice Jobs? <Link href={paths.signup + selected}>Create an account</Link></p></>}
    </>}
  </JobsAuthShell>;
}
