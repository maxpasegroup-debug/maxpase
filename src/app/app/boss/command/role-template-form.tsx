"use client";
import { useActionState } from "react";
import { ShieldCheck } from "lucide-react";
import { bossRoleTemplatesAction, type StaffDraftState } from "./staff-actions";

export function RoleTemplateForm() {
  const [state, action, pending] = useActionState(bossRoleTemplatesAction, {} as StaffDraftState);
  return <form action={action} className="sc-work-form">
    <p>Prepare the AIRA company Director, Administrative Officer and Academic Advisor roles, plus division roles including Labs Full Stack Developer and Business Development Manager. Labs developers and managers activate and sign in on airalabs.online. The Administrative Officer uses airaskillcity.com. This changes role capabilities, not employment or account status.</p>
    <label><input type="checkbox" name="reviewedExistingDirectors" value="true"/> I reviewed existing Director appointments before updating their shared role.</label>
    {state.error && <p role="alert" className="error">{state.error}</p>}{state.message && <p role="status">{state.message}</p>}
    <button disabled={pending}><ShieldCheck size={17}/>{pending ? "Preparing..." : "Prepare access roles"}</button>
  </form>;
}
