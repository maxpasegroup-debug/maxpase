"use client";
import { startTransition, useActionState } from "react";
import { useRouter } from "next/navigation";
import { applicationAction, type ApplicationActionState } from "./application-actions";

type Choice = { id: string; name: string };
function useCommand(operation: "AUTOMATION" | "WORKFORCE_EXCEPTION", realm: string, build: (form: FormData) => unknown) {
  const router = useRouter();
  const [state, action, pending] = useActionState(async (prior: ApplicationActionState, form: FormData) => {
    try {
      form.set("realm", realm); form.set("operation", operation); form.set("command", JSON.stringify(build(form)));
      const result = await applicationAction(prior, form); if (result.success) router.refresh(); return result;
    } catch { return { error: "Check the fields and try again." }; }
  }, {});
  return { state, action, pending };
}
function send(event: React.FormEvent<HTMLFormElement>, pending: boolean, success: string | undefined, action: (form: FormData) => void) {
  event.preventDefault(); if (pending || success) return; const form = new FormData(event.currentTarget); startTransition(() => action(form));
}
function Feedback({ state, pending }: { state: ApplicationActionState; pending: boolean }) { return <>{pending && <p role="status">Saving...</p>}{state.error && <p role="alert">{state.error}</p>}{state.success && <p role="status">{state.success}</p>}</>; }

export function AutomationDraftForm({ realm, divisions, recipients, requestKey, selectedDivision, ruleId, expectedVersion, initial }: { realm: string; divisions: Choice[]; recipients: Choice[]; requestKey: string; selectedDivision?: string; ruleId?: string; expectedVersion?: number; initial?: { name: string; description?: string | null; trigger: string } }) {
  const { state, action, pending } = useCommand("AUTOMATION", realm, form => {
    const trigger = String(form.get("trigger"));
    const actions: Record<string, string> = { TASK_OVERDUE: "NOTIFY_OWNER", APPROVAL_PENDING: "REMIND_APPROVER", PROJECT_BLOCKED: "FLAG_ATTENTION" };
    return { operation: "DRAFT", idempotencyKey: requestKey, ...(ruleId ? { ruleId, expectedVersion } : {}), reason: String(form.get("reason")), definition: { organizationId: String(form.get("organizationId")), name: String(form.get("name")), description: String(form.get("description")), enabled: false, trigger, action: actions[trigger], condition: { recipientUserId: String(form.get("recipientUserId")), minimumAgeMinutes: Number(form.get("minimumAgeMinutes")) } } };
  });
  return <form className="nj-form" onSubmit={e => send(e, pending, state.success, action)}><label>Division<select name="organizationId" required defaultValue={selectedDivision ?? ""}><option value="">Select division</option>{divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label><label>Workflow name<input name="name" required maxLength={200} defaultValue={initial?.name} /></label><label>Description<input name="description" maxLength={500} defaultValue={initial?.description ?? ""} /></label><label>Condition<select name="trigger" required defaultValue={initial?.trigger ?? "TASK_OVERDUE"}><option value="TASK_OVERDUE">Task overdue</option><option value="APPROVAL_PENDING">Approval pending</option><option value="PROJECT_BLOCKED">Project blocked</option></select></label><label>Minimum age in minutes<input name="minimumAgeMinutes" type="number" min="0" max="525600" defaultValue="0" required /></label><label>Recipient<select name="recipientUserId" required><option value="">Select authorized account</option>{recipients.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label><label>Reason<textarea name="reason" required minLength={3} maxLength={500} /></label><label><input type="checkbox" required disabled={pending || !!state.success} /> Confirm draft creation</label><button className="button" disabled={pending || !!state.success || !selectedDivision}>{ruleId ? "Create new version" : "Create draft"}</button><Feedback state={state} pending={pending} /></form>;
}

export function WorkforceCommandForm({ realm, operation, command, label, ownerChoices }: { realm: string; operation: "AUTOMATION" | "WORKFORCE_EXCEPTION"; command: Record<string, unknown>; label: string; ownerChoices?: Choice[] }) {
  const { state, action, pending } = useCommand(operation, realm, form => ({ ...command, ...(form.has("reason") ? { reason: String(form.get("reason")) } : {}), ...(form.has("ownerUserId") ? { ownerUserId: String(form.get("ownerUserId")) } : {}) }));
  return <form className="nj-form" onSubmit={e => send(e, pending, state.success, action)}>{ownerChoices && <label>Responsible account<select name="ownerUserId" required><option value="">Select account</option>{ownerChoices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>}{!["PROCESS_EVENT", "PROCESS_DUE"].includes(String(command.operation)) && <label>Reason<textarea name="reason" required minLength={3} maxLength={500} /></label>}<label><input type="checkbox" required disabled={pending || !!state.success} /> Confirm {label.toLowerCase()}</label><button className="button" disabled={pending || !!state.success}>{pending ? "Saving..." : label}</button><Feedback state={state} pending={pending} /></form>;
}

export function AutomationScheduleForm({ realm, ruleId }: { realm: string; ruleId: string }) {
  const { state, action, pending } = useCommand("AUTOMATION", realm, form => ({ operation: "SCHEDULE", ruleId, reason: String(form.get("reason")), job: { ruleId, nextRunAt: new Date(String(form.get("nextRunAt")) + ":00Z").toISOString(), timezone: "UTC", intervalMinutes: Number(form.get("intervalMinutes")), maxRuns: Number(form.get("maxRuns")), maxAttempts: Number(form.get("maxAttempts")) } }));
  return <form className="nj-form" onSubmit={e => send(e, pending, state.success, action)}><label>First run (UTC)<input name="nextRunAt" type="datetime-local" required /></label><label>Interval (minutes)<input name="intervalMinutes" type="number" min="1" max="525600" defaultValue="1440" required /></label><label>Maximum runs<input name="maxRuns" type="number" min="1" max="1000" defaultValue="1" required /></label><label>Maximum attempts<input name="maxAttempts" type="number" min="1" max="3" defaultValue="3" required /></label><label>Reason<textarea name="reason" required minLength={3} maxLength={500} /></label><label><input type="checkbox" required disabled={pending || !!state.success} /> Confirm UTC schedule</label><button className="button" disabled={pending || !!state.success}>Record schedule</button><Feedback state={state} pending={pending} /></form>;
}
