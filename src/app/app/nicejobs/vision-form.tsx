"use client";
import { useActionState } from "react";
import { saveCandidateVision, type VisionState } from "./candidate-vision-action";
import type { PersonalVision } from "@/server/nicejobs/candidate-vision";
import styles from "./candidate-vision.module.css";

export function VisionForm({ initial }: { initial: PersonalVision | null }) {
  const [state, action, pending] = useActionState(saveCandidateVision, {} as VisionState);
  return <form action={action} className={styles.form} aria-busy={pending}>
    <label>What do you want to learn or achieve?<input name="outcome" defaultValue={initial?.outcome ?? ""} minLength={3} maxLength={160} required placeholder="Example: Become confident in customer conversations" /></label>
    <label>Why does it matter to you?<textarea name="reason" defaultValue={initial?.reason ?? ""} maxLength={500} rows={3} placeholder="A short personal reminder" /></label>
    <label>What is one step you can take next?<input name="nextStep" defaultValue={initial?.nextStep ?? ""} minLength={3} maxLength={160} required placeholder="Example: Practice an introduction today" /></label>
    <button type="submit" disabled={pending}>{pending ? "Saving..." : initial ? "Update goal" : "Save goal"}</button>
    {state.success && <p role="status" className={styles.success}>{state.success}</p>}
    {state.error && <p role="alert" className={styles.error}>{state.error}</p>}
  </form>;
}
