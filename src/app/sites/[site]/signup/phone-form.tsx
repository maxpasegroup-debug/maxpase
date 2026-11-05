"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, X } from "lucide-react";
import { jobsChangeRecoveryEmailAction, jobsPhoneSignupAction, jobsResendVerificationAction, jobsVerifyEmailAction, type PortalLoginState } from "../actions";
import { JobsAuthShell, type JobsAuthPaths } from "../../jobs-ui/auth-shell";
import { PhoneField } from "../../jobs-ui/phone-field";
import styles from "../../jobs-ui/auth.module.css";

function VerifyEmail({ challengeId, deliveryError, paths }: { challengeId?: string; deliveryError?: string; paths: JobsAuthPaths }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<"code" | "resend" | "edit">(challengeId && !deliveryError ? "code" : "resend");
  const [proof, verify, verifying] = useActionState(jobsVerifyEmailAction, {} as PortalLoginState);
  const [resend, requestCode, requesting] = useActionState(jobsResendVerificationAction, {} as PortalLoginState);
  const [changed, changeEmail, changing] = useActionState(jobsChangeRecoveryEmailAction, {} as PortalLoginState);
  const activeChallenge = changed.deliveryPending ? undefined : changed.challengeId ?? resend.challengeId ?? challengeId;
  const undelivered = Boolean(deliveryError && !resend.challengeId && !changed.challengeId);
  useEffect(() => { if (dialog.current && !dialog.current.open) dialog.current.showModal(); }, []);
  useEffect(() => { if (changed.challengeId || resend.challengeId) setMode("code"); }, [changed.challengeId, resend.challengeId]);
  useEffect(() => { if (changed.deliveryPending) setMode("resend"); }, [changed.deliveryPending]);
  return <JobsAuthShell paths={paths} mode="signup" eyebrow="CHECK YOUR EMAIL" title="Verify your email." description="After verification, you can create your six-digit PIN.">
    <p className={styles.status}>Your account is saved. Verification is required before sign-in.</p>
    <p className={styles.switch}>Closed this window? <Link href={paths.login.replace(/\/login$/, "/verify-email")}>Continue verification</Link></p>
    <dialog ref={dialog} className={styles.verificationDialog} aria-labelledby="verify-title">
      <div className={styles.verificationHeader}><div><p className={styles.eyebrow}>RECOVERY EMAIL</p><h2 id="verify-title">Verify your email</h2></div><button type="button" className={styles.dialogClose} title="Continue later" aria-label="Continue later" onClick={() => dialog.current?.close()}><X size={20} /></button></div>
      <p className={styles.dialogIntro}>{activeChallenge && !undelivered ? "Enter the six-digit code sent to your recovery email." : "Your account is saved. Request a new code when email delivery is available."}</p>
      {deliveryError && <p role="alert" className={styles.alert}>{deliveryError}</p>}
      {changed.deliveryPending && changed.error && <p role="alert" className={styles.alert}>{changed.error}</p>}
      <nav className={styles.verifyChoices} aria-label="Email verification options">
        {activeChallenge && !undelivered && <button type="button" aria-current={mode === "code" ? "page" : undefined} onClick={() => setMode("code")}>Enter code</button>}
        <button type="button" aria-current={mode === "resend" ? "page" : undefined} onClick={() => setMode("resend")}>Resend code</button>
        <button type="button" aria-current={mode === "edit" ? "page" : undefined} onClick={() => setMode("edit")}>Edit email</button>
      </nav>
      {mode === "code" && activeChallenge && <form action={verify} className={styles.form} aria-busy={verifying}><fieldset disabled={verifying}><input type="hidden" name="challengeId" value={activeChallenge} /><div className={styles.field}><label htmlFor="signup-code">Email code</label><input id="signup-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required autoFocus /></div><button className={styles.button} disabled={verifying}>{verifying ? "Verifying..." : "Verify and create PIN"}<ArrowRight size={18} /></button></fieldset>{proof.error && <p role="alert" className={styles.alert}>{proof.error}</p>}</form>}
      {mode === "resend" && <form action={requestCode} className={styles.form} aria-busy={requesting}><fieldset disabled={requesting}><PhoneField prefix="resend" /><div className={styles.field}><label htmlFor="resend-email">Registered email</label><input id="resend-email" name="email" type="email" autoComplete="email" required /></div><button className={styles.button} disabled={requesting}>{requesting ? "Requesting..." : "Send a new code"}<ArrowRight size={18} /></button></fieldset>{resend.error && <p role="alert" className={styles.alert}>{resend.error}</p>}{resend.message && <p role="status" className={styles.status}>{resend.message}</p>}</form>}
      {mode === "edit" && <form action={changeEmail} className={styles.form} aria-busy={changing}><fieldset disabled={changing}><input type="hidden" name="challengeId" value={activeChallenge ?? ""} /><div className={styles.field}><label htmlFor="corrected-email">New recovery email</label><input id="corrected-email" name="email" type="email" autoComplete="email" maxLength={254} required /></div><button className={styles.button} disabled={changing || !activeChallenge}>{changing ? "Updating..." : "Update email and send code"}<ArrowRight size={18} /></button></fieldset>{changed.error && !changed.deliveryPending && <p role="alert" className={styles.alert}>{changed.error}</p>}{changed.message && <p role="status" className={styles.status}>{changed.message}</p>}</form>}
    </dialog>
  </JobsAuthShell>;
}

export function ApplicantPhoneSignupForm({ paths }: { paths: JobsAuthPaths }) {
  const [state, action, pending] = useActionState(jobsPhoneSignupAction, {} as PortalLoginState);
  const [details, setDetails] = useState<{ displayName: string; country: string; nationalNumber: string } | null>(null);
  if (state.pendingVerification) return <VerifyEmail challengeId={state.challengeId} deliveryError={state.error} paths={paths} />;
  return <JobsAuthShell paths={paths} mode="signup" eyebrow={`CREATE YOUR ACCOUNT · STEP ${details ? "2" : "1"} OF 3`} title={details ? "Verify your contact." : "Your next step starts here."} description={details ? "Add an email you can open now. We will send a six-digit code." : "Tell us who you are. It takes just a moment."}>
    <ol className={styles.steps} aria-label="Account setup progress"><li aria-current={!details ? "step" : undefined}>Your details</li><li aria-current={details ? "step" : undefined}>Email</li><li>Secure PIN</li></ol>
    {!details ? <form className={styles.form} onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); setDetails({ displayName: String(data.get("displayName") ?? ""), country: String(data.get("country") ?? ""), nationalNumber: String(data.get("nationalNumber") ?? "") }); }}>
      <div className={styles.field}><label htmlFor="jobs-name">Full name</label><input id="jobs-name" name="displayName" autoComplete="name" minLength={2} maxLength={120} required /></div>
      <PhoneField prefix="signup" />
      <button className={styles.button}>Continue<ArrowRight size={18} /></button>
    </form> : <form action={action} className={styles.form} aria-busy={pending}><fieldset disabled={pending}>
      <input type="hidden" name="displayName" value={details.displayName} /><input type="hidden" name="country" value={details.country} /><input type="hidden" name="nationalNumber" value={details.nationalNumber} />
      <div className={styles.field}><label htmlFor="jobs-email">Email address</label><input id="jobs-email" name="email" type="email" autoComplete="email" maxLength={254} required autoFocus /><p className={styles.hint}>We’ll send a code here. This email can also help you reset your PIN.</p></div>
      <p className={styles.notice}>We use your details to process applications. An account does not guarantee employment. Phone ownership is not yet verified.</p>
      <label className={styles.acknowledge}><input name="acknowledge" type="checkbox" required /><span>I understand how my applicant account will be used.</span></label>
      <div className={styles.stepActions}><button type="button" className={styles.backButton} onClick={() => setDetails(null)}>Back</button><button className={styles.button} disabled={pending}>{pending ? "Sending code..." : "Send email code"}<ArrowRight size={18} /></button></div>
    </fieldset>{state.error && <p role="alert" className={styles.alert}>{state.error}</p>}</form>}
    <p className={styles.switch}>Already have an account? <Link href={paths.login}>Sign in</Link> <Link href={paths.login.replace(/\/login$/, "/verify-email")}>Verify email</Link></p>
  </JobsAuthShell>;
}
