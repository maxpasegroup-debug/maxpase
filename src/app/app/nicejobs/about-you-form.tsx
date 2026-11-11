"use client";
import { useActionState, useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { aboutYouOptions, type AboutYou } from "@/server/nicejobs/candidate-about-you";
import { saveAboutYou, type AboutYouActionState } from "./about-you-action";
import styles from "./about-you.module.css";

const labels: Record<AboutYou, string> = {
  STUDENT: "Student",
  LOOKING_FOR_WORK: "Looking for work",
  CURRENTLY_EMPLOYED: "Currently employed",
  HOMEMAKER: "Homemaker",
  SELF_EMPLOYED: "Self-employed",
  OTHER: "Other"
};

export function AboutYouForm({ initial, mode }: { initial: AboutYou | null; mode: "ONBOARDING" | "PROFILE" }) {
  const [state, action, pending] = useActionState(saveAboutYou, {} as AboutYouActionState);
  const [selected, setSelected] = useState<AboutYou | "">(initial ?? "");
  return <form action={action} className={styles.form} aria-busy={pending}>
    <input type="hidden" name="mode" value={mode}/>
    <fieldset disabled={pending}>
      <legend>What best describes you?</legend>
      <div className={styles.options}>{aboutYouOptions.map(option => <label key={option} className={styles.option} data-selected={selected === option}>
        <input type="radio" name="aboutYou" value={option} checked={selected === option} onChange={() => setSelected(option)} required/>
        <span>{labels[option]}</span>{selected === option && <Check size={19} aria-hidden="true"/>}
      </label>)}</div>
      <button type="submit" className={styles.continue} disabled={pending || !selected}>{pending ? "Saving…" : mode === "ONBOARDING" ? "Continue" : "Save changes"}<ArrowRight size={18} aria-hidden="true"/></button>
    </fieldset>
    {state.error && <p role="alert" className={styles.error}>{state.error}</p>}
    {state.message && <p role="status" className={styles.success}>{state.message}</p>}
  </form>;
}
