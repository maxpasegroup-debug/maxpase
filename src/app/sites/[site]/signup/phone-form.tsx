"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { jobsPhoneSignupAction, jobsVerifyEmailAction, type PortalLoginState } from "../actions";
import { JobsAuthShell, type JobsAuthPaths } from "../../jobs-ui/auth-shell";
import { PhoneField } from "../../jobs-ui/phone-field";
import { PinField } from "../../jobs-ui/pin-field";
import styles from "../../jobs-ui/auth.module.css";

function VerifyEmail({ challengeId, paths }: { challengeId: string; paths: JobsAuthPaths }) {
  const [state, action, pending] = useActionState(jobsVerifyEmailAction, {} as PortalLoginState);
  return <JobsAuthShell paths={paths} mode="verify" eyebrow="VERIFY EMAIL" title="Check your email." description="Enter the six-digit code we sent to your address to open your workspace.">
    <form action={action} className={styles.form} aria-busy={pending}><fieldset disabled={pending}><input type="hidden" name="challengeId" value={challengeId} /><div className={styles.field}><label htmlFor="jobs-code">Email code</label><input id="jobs-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required /></div><button className={styles.button} disabled={pending}>{pending ? "Verifying..." : "Verify and continue"}<ArrowRight size={18} /></button></fieldset>{state.error && <p role="alert" className={styles.alert}>{state.error}</p>}</form>
    <p className={styles.switch}>Code expired? <Link href={paths.login.replace(/\/login$/, "/verify-email")}>Request another code</Link></p>
  </JobsAuthShell>;
}

export function ApplicantPhoneSignupForm({ paths }: { paths: JobsAuthPaths }) {
  const [state, action, pending] = useActionState(jobsPhoneSignupAction, {} as PortalLoginState);
  const [pin, setPin] = useState(""), [confirm, setConfirm] = useState("");
  if (state.challengeId) return <VerifyEmail challengeId={state.challengeId} paths={paths} />;
  return <JobsAuthShell paths={paths} mode="signup" eyebrow="CREATE YOUR ACCOUNT" title="Your next step starts here." description="Create an account to explore opportunities and track your applications.">
    <form action={action} className={styles.form} aria-busy={pending} onSubmit={event => { if (pin !== confirm) event.preventDefault(); }}><fieldset disabled={pending}>
      <div className={styles.field}><label htmlFor="jobs-name">Full name</label><input id="jobs-name" name="displayName" autoComplete="name" minLength={2} maxLength={120} required /></div>
      <PhoneField prefix="signup" />
      <div className={styles.field}><label htmlFor="jobs-email">Email address for recovery</label><input id="jobs-email" name="email" type="email" autoComplete="email" maxLength={254} required /><p className={styles.hint}>You must verify this address before you can recover your PIN.</p></div>
      <PinField label="Create six-digit PIN" onChange={setPin} /><PinField name="confirmPin" label="Confirm six-digit PIN" onChange={setConfirm} />
      {confirm && pin !== confirm && <p role="alert" className={styles.inlineError}>PINs do not match.</p>}
      <p className={styles.notice}>We use your contact details and answers to process applications. An account does not guarantee employment or an offer. Phone ownership is not verified until a supported verification service is configured.</p>
      <label className={styles.acknowledge}><input name="acknowledge" type="checkbox" required /><span>I understand how my applicant account will be used.</span></label>
      <button className={styles.button} disabled={pending || Boolean(confirm) && pin !== confirm}>{pending ? "Creating account..." : "Create account"}<ArrowRight size={18} /></button>
    </fieldset>{state.error && <p role="alert" className={styles.alert}>{state.error}</p>}</form>
    <p className={styles.switch}>Already have an account? <Link href={paths.login}>Sign in</Link> <Link href={paths.login.replace(/\/login$/, "/verify-email")}>Verify email</Link></p>
  </JobsAuthShell>;
}
