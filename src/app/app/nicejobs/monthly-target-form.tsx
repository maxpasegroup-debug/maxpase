"use client";
import { useActionState, useState } from "react";
import { saveMonthlyEarningTargetAction, type MonthlyTargetActionState } from "./monthly-target-action";
import styles from "./monthly-target.module.css";

const initialState: MonthlyTargetActionState = {};
export function MonthlyTargetForm({ initial, mode }: { initial: number | null; mode: "ONBOARDING" | "PROFILE" }) {
  const [state, action, pending] = useActionState(saveMonthlyEarningTargetAction, initialState);
  const [amount, setAmount] = useState(initial?.toString() ?? "");
  return <form action={action} className={styles.form}>
    <input type="hidden" name="mode" value={mode}/>
    <label className={styles.label} htmlFor="nicejobs-monthly-target">Monthly target</label>
    <div className={styles.amountField}><span aria-hidden="true">₹</span><input id="nicejobs-monthly-target" name="monthlyTarget" type="number" inputMode="numeric" min="1" step="1" required value={amount} onChange={event => setAmount(event.target.value)} aria-describedby="target-help target-error" placeholder="Enter amount"/></div>
    <p id="target-help" className={styles.helper}>Suggested planning benchmark: <button className={styles.suggestion} type="button" onClick={() => setAmount("50000")}>₹50,000</button> (optional)</p>
    <p className={styles.disclaimer}>This is a personal planning target. It is not a promise or guarantee of earnings.</p>
    {state.error && <p id="target-error" className={styles.error} role="alert">{state.error}</p>}
    {state.message && <p className={styles.success} role="status">{state.message}</p>}
    <button className={styles.submit} type="submit" disabled={pending}>{pending ? "Saving..." : mode === "ONBOARDING" ? "Continue" : "Save target"}<span aria-hidden="true">→</span></button>
  </form>;
}
