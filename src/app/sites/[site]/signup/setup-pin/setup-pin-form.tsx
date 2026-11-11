"use client";
import { useActionState, useState } from "react";
import { ArrowRight } from "lucide-react";
import { jobsFinishSignupAction, type PortalLoginState } from "../../actions";
import { JobsAuthShell, type JobsAuthPaths } from "../../../jobs-ui/auth-shell";
import { PinField } from "../../../jobs-ui/pin-field";
import Link from "next/link";
import styles from "../../../jobs-ui/auth.module.css";

export function SetupPinForm({ paths }: { paths: JobsAuthPaths }) {
  const [state, action, pending] = useActionState(jobsFinishSignupAction, {} as PortalLoginState);
  const [pin, setPin] = useState(""), [confirm, setConfirm] = useState("");
  const [step, setStep] = useState<"pin" | "terms">("pin");
  return <JobsAuthShell paths={paths} mode="signup" eyebrow="EMAIL VERIFIED" title="Secure your account." description="Create a six-digit PIN to open My Workspace.">
    <ol className={styles.steps} aria-label="Account setup progress"><li>Verify email</li><li aria-current={step === "pin" ? "step" : undefined}>Create PIN</li><li aria-current={step === "terms" ? "step" : undefined}>Terms and privacy</li></ol>
    <form action={action} className={styles.form} aria-busy={pending} onSubmit={event => { if (step !== "terms" || pin !== confirm) event.preventDefault(); }}><fieldset disabled={pending}>
      <div hidden={step !== "pin"}>
        <div className={styles.pinPair}><PinField label="Create six-digit PIN" onChange={setPin} /><PinField name="confirmPin" label="Confirm PIN" onChange={setConfirm} /></div>
        {confirm && pin !== confirm && <p role="alert" className={styles.inlineError}>PINs do not match.</p>}
        <button type="button" className={styles.button} disabled={!pin || pin !== confirm} onClick={() => setStep("terms")}>Continue<ArrowRight size={18} /></button>
      </div>
      {step === "terms" && <>
        <p>Before we finish creating your account, please read these documents:</p>
        <p><Link href={`${paths.home}/terms`} target="_blank" rel="noreferrer">Terms &amp; Conditions</Link></p>
        <p><Link href={`${paths.home}/privacy`} target="_blank" rel="noreferrer">Privacy Policy</Link></p>
        <label className={styles.acknowledge}><input type="checkbox" name="acceptLegal" required /><span>I have read and agree to the Terms &amp; Conditions and Privacy Policy.</span></label>
        <div className={styles.stepActions}><button type="button" className={styles.backButton} onClick={() => setStep("pin")}>Back</button><button className={styles.button} disabled={pending}>{pending ? "Finishing registration..." : "Agree and create account"}<ArrowRight size={18} /></button></div>
      </>}
    </fieldset>{state.error && <p role="alert" className={styles.alert}>{state.error}</p>}</form>
  </JobsAuthShell>;
}
