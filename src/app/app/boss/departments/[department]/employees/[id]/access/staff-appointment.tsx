"use client";

import { useActionState } from "react";
import { accessAction, type AccessState } from "./actions";

export function HrStaffAppointment({ employmentId, employmentStatus, email, hasAccount, accountStatus, portal, deliveryReady }: {
  employmentId: string;
  employmentStatus: string;
  email: string | null;
  hasAccount: boolean;
  accountStatus: string | null;
  portal: string;
  deliveryReady: boolean;
}) {
  const [state, action, pending] = useActionState(accessAction, {} as AccessState);
  const canConnect = portal !== "NICEJOBS" && employmentStatus === "ACTIVE" && !!email && !hasAccount && deliveryReady;

  return <section className="executive-band boss-hr-staff-appointment">
    <h2>Employee dashboard</h2>
    {hasAccount ? <p role="status">Account status: {accountStatus ?? "linked"}. Use the account’s verified email setup or reset flow.</p> : <>
      <p>Add the employee record once. This connects the correct work dashboard and emails a secure setup link. The employee verifies their email and creates their own sign-in credential.</p>
      {!deliveryReady && <p role="status">Work email delivery is not configured, so setup email cannot be sent yet.</p>}
      <form action={action} className="boss-hr-action-form">
        <input type="hidden" name="intent" value="connect-dashboard" />
        <input type="hidden" name="employmentId" value={employmentId} />
        <button className="button" disabled={!canConnect || pending}>
          {pending ? "Connecting dashboard…" : "Connect dashboard & send setup email"}
        </button>
        {state.error && <p role="alert">{state.error}</p>}
        {state.message && <p role="status">{state.message}</p>}
      </form>
    </>}
  </section>;
}
