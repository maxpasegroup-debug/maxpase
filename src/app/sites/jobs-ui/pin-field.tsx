"use client";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import styles from "./auth.module.css";

export function PinField({ name = "pin", label = "Six-digit PIN", onChange }: { name?: string; label?: string; onChange?: (value: string) => void }) {
  const [visible, setVisible] = useState(false);
  return <div className={styles.field}><label htmlFor={`jobs-${name}`}>{label}</label><div className={styles.passwordInput}>
    <input id={`jobs-${name}`} name={name} type={visible ? "text" : "password"} inputMode="numeric" autoComplete={name === "pin" ? "current-password" : "new-password"} pattern="[0-9]{6}" minLength={6} maxLength={6} required onChange={event => onChange?.(event.target.value)} />
    <button type="button" title={visible ? "Hide PIN" : "Show PIN"} aria-label={visible ? "Hide PIN" : "Show PIN"} onClick={() => setVisible(value => !value)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button>
  </div></div>;
}
