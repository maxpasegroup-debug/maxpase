"use client";
import { useState, type ChangeEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import styles from "./auth.module.css";

export function PasswordField({ name = "password", label = "Password", autoComplete = "current-password", minLength = 8, hint, invalid, onChange }: {
  name?: string;
  label?: string;
  autoComplete?: string;
  minLength?: number;
  hint?: string;
  invalid?: boolean;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  const [visible, setVisible] = useState(false);
  const id = `jobs-${name}`;
  return <div className={styles.field}>
    <label htmlFor={id}>{label}</label>
    <div className={styles.passwordInput}><input id={id} name={name} type={visible ? "text" : "password"} autoComplete={autoComplete} minLength={minLength} maxLength={72} required onChange={onChange} aria-invalid={invalid || undefined} aria-describedby={hint ? `${id}-hint` : undefined} /><button type="button" onClick={() => setVisible(value => !value)} aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`} aria-pressed={visible} title={visible ? "Hide password" : "Show password"}>{visible ? <EyeOff size={19} /> : <Eye size={19} />}</button></div>
    {hint && <p id={`${id}-hint`} className={styles.hint}>{hint}</p>}
  </div>;
}
