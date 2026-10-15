"use client";
import { useActionState, type ReactNode } from "react";
import { skillCityWorkAction, type SkillCityActionState } from "./actions";

export function WorkForm({ children, actionName, reference, label, confirm }: { children: ReactNode; actionName: "LEAD" | "TASK" | "DECISION" | "DIRECTIVE_PREPARE" | "DIRECTIVE_DECIDE" | "DIRECTIVE_TASK"; reference: string; label: string; confirm?: string }) {
  const [state, action, pending] = useActionState(skillCityWorkAction, {} as SkillCityActionState);
  return <form className="sc-work-form" aria-busy={pending} onSubmit={event=>{if(confirm&&!window.confirm(confirm))event.preventDefault();}} action={async form => {
    for (const key of ["nextFollowUp", "dueDate"]) {
      const value = form.get(key);
      if (typeof value === "string" && value && !value.endsWith("Z")) {
        const date = new Date(value);
        if (!Number.isNaN(date.getTime())) form.set(key, date.toISOString());
      }
    }
    await action(form);
  }}>
    <input type="hidden" name="action" value={actionName}/><input type="hidden" name="reference" value={reference}/>
    {children}
    {state.error&&<p role="alert" className="error">{state.error}</p>}
    {state.message&&<p role="status">{state.message}</p>}
    <button disabled={pending} type="submit">{pending ? "Saving..." : label}</button>
  </form>;
}
