"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "@/server/auth/actions";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Grid2X2, LockKeyhole } from "lucide-react";

const initialState: LoginState = {};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <main className="public-page staff-login">
      <Link className="group-wordmark" href="/"><Grid2X2 size={26} /><span>MAXPASE<span className="wordmark-sub">GROUP</span></span></Link>
      <section className="login-panel staff-login-panel" aria-labelledby="login-title">
        <LockKeyhole className="login-shield" size={28} />
        <p className="eyebrow">MAXPASE OS / STAFF ACCESS</p>
        <h1 id="login-title">Staff sign-in</h1>
        <p className="login-subtitle">Sign in to your workspace.</p>
        <form className="form-stack" action={formAction} aria-busy={pending}>
          <label>
            Email
            <input name="email" type="email" autoComplete="username" maxLength={254} required />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" maxLength={72} required />
          </label>
          {state.error ? <p className="error" role="alert">{state.error}</p> : null}
          {pending && <p role="status">Signing in...</p>}
          <button className="button group-cta login-submit" type="submit" disabled={pending}>
            {pending ? "Signing in" : "Sign in"}<ArrowRight size={18} />
          </button>
        </form>
        <p className="section"><Link href="/login">Command center PIN sign-in</Link></p>
      </section>
      <Link className="login-back" href="/"><ArrowLeft size={16} />Back to MAXPASE GROUP</Link>
    </main>
  );
}
