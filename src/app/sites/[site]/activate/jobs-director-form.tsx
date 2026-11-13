"use client";

import { useActionState } from "react";
import Link from "next/link";
import { activateJobsDirectorAction, resendJobsDirectorMobileCodeAction, verifyJobsDirectorEmailAction, type JobsDirectorActivationState } from "./actions";

const initial: JobsDirectorActivationState = {};
export function JobsDirectorActivationForm({ challengeId, emailVerified, login }: { challengeId: string; emailVerified: boolean; login: string }) {
  const [emailState, verifyEmail, verifyingEmail] = useActionState(verifyJobsDirectorEmailAction, initial);
  const [mobileState, activate, activating] = useActionState(activateJobsDirectorAction, initial);
  const [resendState, resend, resending] = useActionState(resendJobsDirectorMobileCodeAction, initial);
  const verified = emailVerified || !!emailState.emailVerified || !!resendState.emailVerified;
  const phoneChallengeId = emailState.phoneChallengeId ?? resendState.phoneChallengeId;
  const completed = !!mobileState.message;
  return <div className="business-form">
    {!verified && <form action={verifyEmail}><input type="hidden" name="challengeId" value={challengeId}/><label>Six-digit email code<input name="code" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} autoComplete="one-time-code" required/></label>{emailState.error && <p role="alert" className="error">{emailState.error}</p>}{emailState.message && <p role="status">{emailState.message}</p>}<button disabled={verifyingEmail || !challengeId}>{verifyingEmail ? "Verifying..." : "Verify email"}</button></form>}
    {verified && !phoneChallengeId && !completed && <><p role="status">Email verified. Send a one-time code to the appointed mobile number.</p>{emailState.error && <p role="alert" className="error">{emailState.error}</p>}<form action={resend}><input type="hidden" name="challengeId" value={challengeId}/>{resendState.error && <p role="alert" className="error">{resendState.error}</p>}{resendState.message && <p role="status">{resendState.message}</p>}<button disabled={resending || !challengeId}>{resending ? "Sending..." : "Send mobile code"}</button></form></>}
    {verified && phoneChallengeId && !completed && <form action={activate}><input type="hidden" name="challengeId" value={phoneChallengeId}/><label>Six-digit mobile code<input name="code" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} autoComplete="one-time-code" required/></label><label>Create your six-digit NICEJOBS PIN<input name="pin" type="password" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} autoComplete="new-password" required/></label><label>Confirm PIN<input name="confirmPin" type="password" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} autoComplete="new-password" required/></label>{mobileState.error && <p role="alert" className="error">{mobileState.error}</p>}{mobileState.message && <p role="status">{mobileState.message} <Link href={login}>Sign in</Link></p>}<button disabled={activating || completed}>{activating ? "Activating..." : "Verify mobile and activate"}</button></form>}
    {verified && phoneChallengeId && <form action={resend}><input type="hidden" name="challengeId" value={challengeId}/><button type="submit" disabled={resending || completed}>{resending ? "Sending..." : "Resend mobile code"}</button>{resendState.error && <p role="alert" className="error">{resendState.error}</p>}</form>}
    {!challengeId && <p role="alert" className="error">This appointment link is missing or invalid. Ask the MAXPASE Boss to resend it.</p>}
  </div>;
}
