"use client";
import { useActionState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, LockKeyhole } from "lucide-react";
import { portalLoginAction, type PortalLoginState } from "../actions";
import type { PortalSite } from "@/server/portals/sites";

export function PortalLoginForm({ site, home }: { site: PortalSite; home: string }) {
  const [state, action, pending] = useActionState(portalLoginAction, {} as PortalLoginState);
  return <main className={`portal-login portal-${site.theme}`}><Link className="portal-wordmark" href={home}>{site.name}<span>AIRA SKILL CITY</span></Link><section className="portal-login-panel"><LockKeyhole size={28} /><p className="portal-kicker">MEMBER GATEWAY</p><h1>Welcome back.</h1><p className="muted">Sign in to {site.name}.</p><form action={action} className="form-stack" aria-busy={pending}><input type="hidden" name="site" value={site.id} /><label>Email<input name="email" type="email" autoComplete="username" maxLength={254} required /></label><label>Password<input name="password" type="password" autoComplete="current-password" minLength={8} maxLength={72} required /></label>{state.error && <p role="alert" className="error">{state.error}</p>}<button className="portal-button" disabled={pending}>{pending ? "Signing in..." : "Sign in"}<ArrowRight size={18} /></button></form></section><Link className="portal-back" href={home}><ArrowLeft size={16} />Back to {site.name}</Link></main>;
}
