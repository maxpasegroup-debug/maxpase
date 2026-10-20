"use client";
import { useActionState } from "react";
import { ArrowRight } from "lucide-react";
import { jobsResendVerificationAction, jobsVerifyEmailAction, type PortalLoginState } from "./actions";
import { JobsAuthShell, type JobsAuthPaths } from "../jobs-ui/auth-shell";
import { PhoneField } from "../jobs-ui/phone-field";
import { PinField } from "../jobs-ui/pin-field";
import styles from "../jobs-ui/auth.module.css";

export function JobsResendVerificationForm({ paths }: { paths: JobsAuthPaths }) {
  const [state, action, pending] = useActionState(jobsResendVerificationAction, {} as PortalLoginState);
  const [proof, verify, verifying] = useActionState(jobsVerifyEmailAction, {} as PortalLoginState);
  return <JobsAuthShell paths={paths} mode="verify" eyebrow="VERIFY EMAIL" title="Verify your email." description="Request a fresh code using the phone and PIN you registered with.">
    {state.message && <p role="status" className={styles.status}>{state.message}</p>}
    {!state.challengeId ? <form action={action} className={styles.form} aria-busy={pending}><fieldset disabled={pending}><PhoneField prefix="verify" /><PinField /><button className={styles.button} disabled={pending}>{pending ? "Please wait..." : "Request code"}<ArrowRight size={18} /></button></fieldset>{state.error && <p role="alert" className={styles.alert}>{state.error}</p>}</form> : <form action={verify} className={styles.form} aria-busy={verifying}><fieldset disabled={verifying}><input type="hidden" name="challengeId" value={state.challengeId} /><div className={styles.field}><label htmlFor="jobs-code">Email code</label><input id="jobs-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required /></div><button className={styles.button} disabled={verifying}>{verifying ? "Verifying..." : "Verify and continue"}<ArrowRight size={18} /></button></fieldset>{proof.error && <p role="alert" className={styles.alert}>{proof.error}</p>}</form>}
  </JobsAuthShell>;
}
