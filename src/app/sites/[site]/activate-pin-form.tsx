"use client";
import { useActionState, useState } from "react";
import { ArrowRight } from "lucide-react";
import { jobsActivatePinAction, type PortalLoginState } from "./actions";
import { JobsAuthShell, type JobsAuthPaths } from "../jobs-ui/auth-shell";
import { PhoneField } from "../jobs-ui/phone-field";
import { PinField } from "../jobs-ui/pin-field";
import styles from "../jobs-ui/auth.module.css";

export function JobsActivatePinForm({ paths }: { paths: JobsAuthPaths }) {
  const [state, action, pending] = useActionState(jobsActivatePinAction, {} as PortalLoginState);
  const [pin, setPin] = useState(""), [confirm, setConfirm] = useState("");
  return <JobsAuthShell paths={paths} mode="signup" eyebrow="ACCOUNT UPDATE" title="Set up phone sign-in." description="Your existing account is verified. Add a phone number and six-digit PIN to keep using your workspace.">
    <form action={action} className={styles.form} aria-busy={pending} onSubmit={event => { if (pin !== confirm) event.preventDefault(); }}><fieldset disabled={pending}><PhoneField prefix="activate" /><PinField label="Create six-digit PIN" onChange={setPin} /><PinField name="confirmPin" label="Confirm PIN" onChange={setConfirm} /><p className={styles.hint}>We cannot mark this phone as verified until phone verification is configured.</p><button className={styles.button} disabled={pending || Boolean(confirm) && pin !== confirm}>{pending ? "Saving..." : "Activate phone sign-in"}<ArrowRight size={18} /></button></fieldset>{state.error && <p role="alert" className={styles.alert}>{state.error}</p>}</form>
  </JobsAuthShell>;
}
