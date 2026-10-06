"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "@/server/auth/actions";
import Link from "next/link";

const initialState: LoginState = {};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <main className="public-page">
      <section className="login-panel" aria-labelledby="login-title">
        <p className="eyebrow">MAXPASE OS</p>
        <h1 id="login-title">Staff sign-in</h1>
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
          <button className="button" type="submit" disabled={pending}>
            {pending ? "Signing in" : "Sign in"}
          </button>
        </form>
        <p className="section"><Link href="/login">Command center PIN sign-in</Link></p>
      </section>
    </main>
  );
}
