"use client";
import { useActionState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, UserRound } from "lucide-react";
import { applicantSignupAction, jobsEmailLoginAction, type PortalLoginState } from "../actions";
import { JobsCodeFields } from "../email-auth-form";

function VerifySignup({ challengeId, login, versionId }: { challengeId: string; login: string; versionId?: string }) {
  const [state, action, pending] = useActionState(jobsEmailLoginAction, {} as PortalLoginState);
  return <><p role="status">Check your email for a six-digit code. It expires in 10 minutes.</p><form action={action} className="form-stack" aria-busy={pending}>{versionId && <input type="hidden" name="versionId" value={versionId} />}<fieldset disabled={pending}><JobsCodeFields challengeId={challengeId} /><button className="portal-button" disabled={pending}>{pending ? "Verifying..." : "Verify and continue"}<ArrowRight size={18} /></button></fieldset>{state.error && <p role="alert" className="error">{state.error}</p>}</form><p><Link href={login + (versionId ? `?versionId=${encodeURIComponent(versionId)}` : "")}>Sign in / request a new code</Link></p></>;
}

export function ApplicantSignupForm({ paths, versionId }: { paths: { home: string; login: string }; versionId?: string }) {
  const [state, action, pending] = useActionState(applicantSignupAction, {} as PortalLoginState);
  if (state.challengeId) return <main className="portal-login portal-jobs"><Link className="portal-wordmark" href={paths.home}>Nice Jobs<span>AIRA CAREER HUB</span></Link><section className="portal-login-panel"><h1>Verify your email</h1><VerifySignup challengeId={state.challengeId} login={paths.login} versionId={versionId} /></section></main>;
  return <main className="portal-login portal-jobs"><Link className="portal-wordmark" href={paths.home}>Nice Jobs<span>AIRA CAREER HUB</span></Link><section className="portal-login-panel"><UserRound size={28} /><p className="portal-kicker">YOUR APPLICATION</p><h1>Start your journey.</h1><p>Create your applicant account to save answers and follow your application.</p><form action={action} className="form-stack" aria-busy={pending}>
    {versionId && <input type="hidden" name="versionId" value={versionId} />}<fieldset disabled={pending}><label>Your name<input name="displayName" autoComplete="name" minLength={2} maxLength={120} required /></label><label>Email<input name="email" type="email" autoComplete="username" maxLength={254} required /></label><label>Password<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={72} required /></label><label>Confirm password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={72} required /></label>
    <p className="nj-registration-notice">Your name, email and application answers are used to process your applications. Hiring teams can review the applications they manage. Creating an account does not confirm employment or guarantee an offer.</p><label className="nj-registration-ack"><input name="acknowledge" type="checkbox" required />I understand how my applicant account will be used.</label><button className="portal-button" disabled={pending}>{pending ? "Creating account..." : "Create account"}<ArrowRight size={18} /></button></fieldset>{state.error && <p role="alert" className="error">{state.error}</p>}
  </form><p>Already registered? <Link href={paths.login + (versionId ? `?versionId=${encodeURIComponent(versionId)}` : "")}>Sign in</Link></p></section><Link className="portal-back" href={paths.home}><ArrowLeft size={16} />Back to Nice Jobs</Link></main>;
}
