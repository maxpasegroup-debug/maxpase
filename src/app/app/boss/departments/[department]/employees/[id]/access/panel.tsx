"use client";

import { useActionState } from "react";
import { accessAction, type AccessState } from "./actions";

type Overview = Awaited<ReturnType<typeof import("@/server/group/hr-access").hrAccess.overview>>;

function Form({ employmentId, children }: { employmentId: string; children: React.ReactNode }) {
  const [state, action, pending] = useActionState(accessAction, {} as AccessState);
  return <form action={action} className="boss-hr-action-form">
    <input type="hidden" name="employmentId" value={employmentId}/>{children}
    <button className="button secondary" disabled={pending}>{pending ? "Saving…" : "Confirm"}</button>
    {state.error && <p role="alert">{state.error}</p>}{state.message && <p role="status">{state.message}</p>}
  </form>;
}

export function HrAccessPanel({ employmentId, data, deliveryReady, managedInvite = false }: { employmentId: string; data: Overview; deliveryReady: boolean; managedInvite?: boolean }) {
  const accountPortal = ["AIRA Skill City", "AIRA Labs"].includes(data.portal);
  return <>
    <section className="executive-band">
      <h2>Account and invitation</h2>
      <p>Employee portal: {data.portal}. Employment: {data.employmentStatus}. An HR record does not itself grant login access.</p>
      <p>Account: {data.account ? `${data.account.status} · ${data.account.verified ? "email verified" : "email unverified"}` : "No linked account"}</p>
      {data.portal === "NICEJOBS" ? <p>{data.account?.status === "ACTIVE" ? "The Director signs in with their NICEJOBS mobile number and PIN. HR can manage only the scoped Director role; it never changes or reveals the PIN." : "The pending account stays inactive until the appointee verifies email and mobile access and chooses their own six-digit PIN."}</p> : <p>Latest invitation: {data.invitation ? `${data.invitation.status} · ${new Date(data.invitation.createdAt).toLocaleString()}` : "None"}</p>}
      {data.portal === "NICEJOBS" && data.account?.status === "INACTIVE" && data.employmentStatus === "ACTIVE" && <><p>Director appointment: {data.invitation ? `${data.invitation.status} · ${new Date(data.invitation.createdAt).toLocaleString()}` : "Pending invitation"}. The appointee must verify email and mobile access and choose their own PIN.</p><Form employmentId={employmentId}><input type="hidden" name="intent" value="send-invite"/><input type="hidden" name="userId" value={data.account.id}/><span>{data.invitation?.status === "SENT" ? "Resend activation instructions" : "Send activation instructions"}</span></Form></>}
      {data.portal === "NICEJOBS" && data.account?.status === "INACTIVE" && data.invitation && <Form employmentId={employmentId}><input type="hidden" name="intent" value="revoke-invite"/><input type="hidden" name="challengeId" value={data.invitation.id}/><span>Cancel pending appointment</span></Form>}
      {accountPortal && data.account?.status === "INACTIVE" && <><p>{deliveryReady ? "Email provider settings are present; live delivery is unverified." : "Email delivery is not configured; invitation sending is unavailable."}</p>{data.employmentStatus !== "ACTIVE" || data.account.realm !== (data.portal === "AIRA Labs" ? "labs" : "skillcity") || !data.memberships.some(item => item.status === "INVITED") ? <p>Activate employment and complete the reviewed staff appointment before sending an invitation.</p> : deliveryReady && !managedInvite && <Form employmentId={employmentId}><input type="hidden" name="intent" value="send-invite"/><input type="hidden" name="userId" value={data.account.id}/><label>Identity and scope verification reference <input name="verificationEvidence" required minLength={10} maxLength={1000}/></label></Form>}</>}
      {accountPortal && data.invitation && ["PENDING", "SENT"].includes(data.invitation.status) && <Form employmentId={employmentId}><input type="hidden" name="intent" value="revoke-invite"/><input type="hidden" name="challengeId" value={data.invitation.id}/><span>Cancel this invitation code</span></Form>}
      {accountPortal && data.account?.status === "ACTIVE" && <Form employmentId={employmentId}><input type="hidden" name="intent" value="suspend-account"/><label>Reason or decision reference for account suspension <input name="decisionReference" required minLength={8} maxLength={200}/></label></Form>}
      {accountPortal && data.account?.status === "SUSPENDED" && <Form employmentId={employmentId}><input type="hidden" name="intent" value="resume-account"/><p>Resuming the account does not restore suspended brand or company memberships. Review each scope below.</p><label>Reason or decision reference for account resumption <input name="decisionReference" required minLength={8} maxLength={200}/></label></Form>}
      {data.portal === "NOT CONFIGURED" && <p role="status">Employee portal and approved role templates are not configured for this company. Invitations and login activation remain blocked.</p>}
    </section>
    <section className="executive-band"><h2>Invitation and access history</h2>{!data.invitations.length && !data.history.length && <p>No recorded invitation or membership events in this company scope.</p>}<ol>{data.invitations.map(item => <li key={item.id}>Invitation · {item.status} · {new Date(item.createdAt).toLocaleString()}</li>)}{data.history.map(item => <li key={item.id}>{new Date(item.createdAt).toLocaleString()} · {item.eventType.replaceAll("_", " ")} · {item.status} · {item.actor?.email ?? "System"}</li>)}</ol></section>
    <section className="executive-band">
      <h2>Company and brand access</h2>
      {!data.memberships.length && <p>No memberships recorded for this company.</p>}
      {data.memberships.map(member => {
        const niceJobsDirector = member.roles.includes("NICEJOBS Director");
        const latestDirectorAction = data.history.find(item => item.entityId === member.id && item.eventType.startsWith("hr.nicejobs_director_access_"))?.eventType;
        return <div key={member.id} className="boss-hr-employee"><strong>{member.organization}</strong> · {member.status} · {member.roles.join(", ") || (member.organization === "NICEJOBS" ? "No active Director role" : "No role")}<small> · {member.scopeKey}</small>
          {member.status === "ACTIVE" && niceJobsDirector ? <><Form employmentId={employmentId}><input type="hidden" name="intent" value="change"/><input type="hidden" name="membershipId" value={member.id}/><input type="hidden" name="action" value="suspend"/><span>Suspend NICEJOBS Director access</span></Form><Form employmentId={employmentId}><input type="hidden" name="intent" value="change"/><input type="hidden" name="membershipId" value={member.id}/><input type="hidden" name="action" value="revoke"/><span>Revoke NICEJOBS Director access</span></Form></> : member.status === "ACTIVE" && <><Form employmentId={employmentId}><input type="hidden" name="intent" value="change"/><input type="hidden" name="membershipId" value={member.id}/><input type="hidden" name="action" value="suspend"/><span>Suspend access</span></Form><Form employmentId={employmentId}><input type="hidden" name="intent" value="change"/><input type="hidden" name="membershipId" value={member.id}/><input type="hidden" name="action" value="revoke"/><span>Revoke access</span></Form></>}
          {member.status === "ACTIVE" && !niceJobsDirector && member.organization === "NICEJOBS" && latestDirectorAction === "hr.nicejobs_director_access_suspended" && <Form employmentId={employmentId}><input type="hidden" name="intent" value="change"/><input type="hidden" name="membershipId" value={member.id}/><input type="hidden" name="action" value="resume"/><span>Resume suspended NICEJOBS Director access</span></Form>}
          {member.status === "SUSPENDED" && <Form employmentId={employmentId}><input type="hidden" name="intent" value="change"/><input type="hidden" name="membershipId" value={member.id}/><input type="hidden" name="action" value="resume"/><span>Resume reviewed access</span></Form>}
        </div>;
      })}
      {data.employmentStatus === "ACTIVE" && data.account?.status === "ACTIVE" && data.account.verified && data.targets.map(target => { const roles = data.roles.filter(role => role.organizationId === target.id); return roles.length ? <div key={target.id}><h3>{target.name}</h3><Form employmentId={employmentId}><input type="hidden" name="intent" value="grant"/><input type="hidden" name="organizationId" value={target.id}/>{target.brandId && <input type="hidden" name="brandId" value={target.brandId}/>}<label>Approved role <select name="roleId" required defaultValue=""><option value="">Choose role</option>{roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label></Form></div> : null; })}
    </section>
  </>;
}
