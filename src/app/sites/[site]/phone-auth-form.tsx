"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { jobsPhoneLoginAction, jobsPinResetAction, type PortalLoginState } from "./actions";
import { JobsAuthShell, type JobsAuthPaths } from "../jobs-ui/auth-shell";
import { PhoneField } from "../jobs-ui/phone-field";
import { PinField } from "../jobs-ui/pin-field";
import styles from "../jobs-ui/auth.module.css";

export function JobsPhoneAuthForm({ paths, reset = false }: { paths: JobsAuthPaths; reset?: boolean }) {
  const [state, action, pending] = useActionState(reset ? jobsPinResetAction : jobsPhoneLoginAction, {} as PortalLoginState);
  const [pin, setPin] = useState(""), [confirm, setConfirm] = useState("");
  const resetPath = paths.login.replace(/\/login$/, "/reset-password");
  const verifying = reset && Boolean(state.challengeId);
  return <JobsAuthShell paths={paths} mode={reset ? "reset" : "login"} eyebrow={reset ? "ACCOUNT RECOVERY" : "YOUR ACCOUNT"} title={state.complete ? "PIN changed." : reset ? verifying ? "Check your email." : "Reset your PIN." : "Welcome back."} description={reset ? verifying ? "Enter the code from your registered email and choose a new PIN." : "Enter your registered phone number. We will email a recovery code if the account is eligible." : "Sign in to your Nice Jobs workspace."}>
    {state.message && <p role="status" className={styles.status}>{state.message}</p>}
    {!state.complete && <form action={action} className={styles.form} aria-busy={pending} onSubmit={event => { if (verifying && pin !== confirm) event.preventDefault(); }}>
      <fieldset disabled={pending}>
        {verifying ? <><input type="hidden" name="step" value="VERIFY" /><input type="hidden" name="challengeId" value={state.challengeId} /><div className={styles.field}><label htmlFor="jobs-code">Six-digit email code</label><input id="jobs-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required /><p className={styles.hint}>The code expires in 10 minutes and can be used once.</p></div><PinField label="New six-digit PIN" onChange={setPin} /><PinField name="confirmPin" label="Confirm new PIN" onChange={setConfirm} />{confirm && pin !== confirm && <p role="alert" className={styles.inlineError}>PINs do not match.</p>}</> : <><PhoneField prefix={reset ? "reset" : "login"} />{!reset && <PinField />}</>}
        <button className={styles.button} disabled={pending || verifying && Boolean(confirm) && pin !== confirm}>{pending ? "Please wait..." : reset ? verifying ? "Change PIN" : "Send recovery code" : "Sign in"}<ArrowRight size={18} /></button>
      </fieldset>
      {state.error && <p role="alert" className={styles.alert}>{state.error}</p>}
    </form>}
    {reset ? <p className={styles.switch}><Link href={paths.login}>{state.complete ? "Sign in with your new PIN" : "Back to sign in"}</Link>{verifying && <Link href={resetPath}>Request a new code</Link>}</p> : <><p className={styles.supportLink}><Link href={resetPath}>Forgot PIN?</Link></p><p className={styles.switch}>New to Nice Jobs? <Link href={paths.signup}>Create an account</Link></p><p className={styles.switch}>Have an older email/password account? <Link href={paths.login.replace(/\/login$/, "/activate-pin")}>Activate phone sign-in</Link></p></>}
  </JobsAuthShell>;
}
