"use client";
import { useActionState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, LockKeyhole } from "lucide-react";
import { portalLoginAction, type PortalLoginState } from "../actions";
import type { PortalSite } from "@/server/portals/sites";

export function PortalLoginForm({ site, home, versionId, signup }: { site: PortalSite; home: string; versionId?: string; signup?: string }) {
  const [state, action, pending] = useActionState(portalLoginAction, {} as PortalLoginState);
  return <main className={`portal-login portal-${site.theme}`}><Link className="portal-wordmark" href={home}>{site.name}<span>AIRA SKILL CITY</span></Link><section className="portal-login-panel"><LockKeyhole size={28} /><p className="portal-kicker">{site.id === "labs" ? "CUSTOMER & TEAM SIGN IN" : "MEMBER GATEWAY"}</p><h1>Welcome back.</h1><p className="muted">{versionId ? "Sign in to continue your application." : `Sign in to ${site.name}.`}</p><form action={action} className="form-stack" aria-busy={pending}><input type="hidden" name="site" value={site.id} />{versionId && <input type="hidden" name="versionId" value={versionId} />}<label>Email<input name="email" type="email" autoComplete="username" maxLength={254} required /></label><label>{site.id === "labs" ? "Six-digit PIN" : "Password"}<input name="password" type="password" inputMode={site.id === "labs" ? "numeric" : undefined} pattern={site.id === "labs" ? "[0-9]{6}" : undefined} autoComplete="current-password" minLength={site.id === "labs" ? 6 : 8} maxLength={site.id === "labs" ? 6 : 72} required /></label>{state.error && <p role="alert" className="error">{state.error}</p>}<button className="portal-button" disabled={pending}>{pending ? "Signing in..." : "Sign in"}<ArrowRight size={18} /></button></form>{site.id === "labs" && <p>Account recovery requires an authorized administrator. Never share your PIN.</p>}{signup && <p>New here? <Link href={signup + (versionId ? `?versionId=${encodeURIComponent(versionId)}` : "")}>Create an applicant account</Link></p>}</section><Link className="portal-back" href={home}><ArrowLeft size={16} />Back to {site.name}</Link></main>;
}
