"use client";
import { useActionState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Grid2X2, ShieldCheck } from "lucide-react";
import { bossLoginAction, type LoginState } from "@/server/auth/actions";
export default function BossLogin() {
  const [state, action, pending] = useActionState(bossLoginAction, {} as LoginState);
  return <main className="group-login">
    <Link className="group-wordmark" href="/"><Grid2X2 size={26} /><span>MAXPASE<span className="wordmark-sub">GROUP</span></span></Link>
    <section className="group-login-panel" aria-labelledby="login-title">
      <ShieldCheck className="login-shield" size={30} />
      <p className="group-kicker">MAXPASE OS</p><h1 id="login-title">Welcome back.</h1>
      <p className="login-subtitle">Sign in to your command center.</p>
      <form action={action} className="form-stack" aria-busy={pending}>
        <label>Email<input name="email" type="email" autoComplete="username" placeholder="boss@maxpase.com" required maxLength={254} /></label>
        <label>6-digit PIN<input className="pin-input" name="pin" type="password" inputMode="numeric" autoComplete="current-password" pattern="[0-9]{6}" minLength={6} maxLength={6} required /></label>
        {state.error && <p role="alert" className="error">{state.error}</p>}
        <button className="group-cta login-submit" disabled={pending}>{pending ? "Signing in..." : "Sign in"}<ArrowRight size={18} /></button>
      </form>
      <Link className="staff-login-link" href="/staff/login">Staff password sign-in</Link>
    </section>
    <Link className="login-back" href="/"><ArrowLeft size={16} />Back to MAXPASE GROUP</Link>
  </main>;
}
