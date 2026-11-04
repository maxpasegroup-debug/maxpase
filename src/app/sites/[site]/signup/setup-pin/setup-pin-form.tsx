"use client";
import { useActionState, useState } from "react";
import { ArrowRight } from "lucide-react";
import { jobsFinishSignupAction, type PortalLoginState } from "../../actions";
import { JobsAuthShell, type JobsAuthPaths } from "../../../jobs-ui/auth-shell";
import { PinField } from "../../../jobs-ui/pin-field";
import styles from "../../../jobs-ui/auth.module.css";

export function SetupPinForm({ paths }: { paths: JobsAuthPaths }) {
  const [state, action, pending] = useActionState(jobsFinishSignupAction, {} as PortalLoginState);
  const [pin, setPin] = useState(""), [confirm, setConfirm] = useState("");
  return <JobsAuthShell paths={paths} mode="signup" eyebrow="EMAIL VERIFIED" title="Secure your account." description="Create a six-digit PIN to open My Workspace.">
    <form action={action} className={styles.form} aria-busy={pending} onSubmit={event => { if (pin !== confirm) event.preventDefault(); }}><fieldset disabled={pending}>
      <div className={styles.pinPair}><PinField label="Create six-digit PIN" onChange={setPin} /><PinField name="confirmPin" label="Confirm PIN" onChange={setConfirm} /></div>
      {confirm && pin !== confirm && <p role="alert" className={styles.inlineError}>PINs do not match.</p>}
      <button className={styles.button} disabled={pending || Boolean(confirm) && pin !== confirm}>{pending ? "Saving PIN..." : "Open My Workspace"}<ArrowRight size={18} /></button>
    </fieldset>{state.error && <p role="alert" className={styles.alert}>{state.error}</p>}</form>
  </JobsAuthShell>;
}
