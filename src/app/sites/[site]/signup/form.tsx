"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { applicantSignupAction, jobsEmailLoginAction, type PortalLoginState } from "../actions";
import { JobsCodeFields } from "../email-auth-form";
import { JobsAuthShell, type JobsAuthPaths } from "../../jobs-ui/auth-shell";
import { PasswordField } from "../../jobs-ui/password-field";
import styles from "../../jobs-ui/auth.module.css";

function VerifySignup({ challengeId, paths, versionId }: { challengeId: string; paths: JobsAuthPaths; versionId?: string }) {
  const [state, action, pending] = useActionState(jobsEmailLoginAction, {} as PortalLoginState);
  const selected = versionId ? `?versionId=${encodeURIComponent(versionId)}` : "";
  return <JobsAuthShell paths={paths} mode="verify" eyebrow="ONE MORE STEP" title="Check your email." description="Enter the six-digit code to verify your address and continue.">
    <p role="status" className={styles.status}>Your code expires in 10 minutes. Keep it private.</p>
    <form action={action} className={styles.form} aria-busy={pending}>
      {versionId && <input type="hidden" name="versionId" value={versionId} />}
      <fieldset disabled={pending}><JobsCodeFields challengeId={challengeId} /><button className={styles.button} disabled={pending}>{pending ? "Verifying..." : "Verify and continue"}<ArrowRight size={18} /></button></fieldset>
      {state.error && <p role="alert" className={styles.alert}>{state.error}</p>}
    </form>
    <p className={styles.switch}>No code? <Link href={paths.login + selected}>Sign in to request a new one</Link></p>
  </JobsAuthShell>;
}

export function ApplicantSignupForm({ paths, versionId }: { paths: JobsAuthPaths; versionId?: string }) {
  const [state, action, pending] = useActionState(applicantSignupAction, {} as PortalLoginState);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [attempted, setAttempted] = useState(false);
  const mismatch = confirmation.length > 0 && password !== confirmation;
  const selected = versionId ? `?versionId=${encodeURIComponent(versionId)}` : "";
  if (state.challengeId) return <VerifySignup challengeId={state.challengeId} paths={paths} versionId={versionId} />;
  return <JobsAuthShell paths={paths} mode="signup" eyebrow="CREATE YOUR ACCOUNT" title="Your next step starts here." description="Make an account to explore opportunities and track your applications.">
    <form action={action} className={styles.form} aria-busy={pending} onSubmit={event => { if (password !== confirmation) { event.preventDefault(); setAttempted(true); } }}>
      {versionId && <input type="hidden" name="versionId" value={versionId} />}
      <fieldset disabled={pending}>
        <div className={styles.field}><label htmlFor="jobs-name">Full name</label><input id="jobs-name" name="displayName" autoComplete="name" minLength={2} maxLength={120} required /></div>
        <div className={styles.field}><label htmlFor="jobs-email">Email address</label><input id="jobs-email" name="email" type="email" autoComplete="username" maxLength={254} required /></div>
        <PasswordField autoComplete="new-password" minLength={12} hint="Use at least 12 characters." onChange={event => setPassword(event.target.value)} />
        <PasswordField name="confirmPassword" label="Confirm password" autoComplete="new-password" minLength={12} invalid={mismatch || attempted && password !== confirmation} onChange={event => setConfirmation(event.target.value)} />
        {(mismatch || attempted && password !== confirmation) && <p role="alert" className={styles.inlineError}>Passwords do not match.</p>}
        <p className={styles.notice}>We use your name, email and answers to process applications. Hiring teams can review applications they manage. An account does not guarantee employment or an offer.</p>
        <label className={styles.acknowledge}><input name="acknowledge" type="checkbox" required /><span>I understand how my applicant account will be used.</span></label>
        <button className={styles.button} disabled={pending}>{pending ? "Creating account..." : "Create account"}<ArrowRight size={18} /></button>
      </fieldset>
      {state.error && <p role="alert" className={styles.alert}>{state.error}</p>}
    </form>
    <p className={styles.switch}>Already have an account? <Link href={paths.login + selected}>Sign in</Link></p>
  </JobsAuthShell>;
}
