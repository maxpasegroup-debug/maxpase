"use client";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { applicationAction, type ApplicationActionState } from "./application-actions";
export function GoalProposal({ realm, requestKey, previousGoalId, policies, siaId, siaStatus }: { realm: string; requestKey: string; previousGoalId?: string; policies: { id: string; name: string }[]; siaId: string | null; siaStatus: "AVAILABLE" | "NOT_CONFIGURED" | "NOT_AUTHORIZED" }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(async (s: ApplicationActionState, form: FormData) => {
    form.set("operation", "GOAL_PLAN");
    form.set("command", JSON.stringify({ operation: "PROPOSE", idempotencyKey: requestKey, confirmed: form.get("confirmed") === "on", outcome: { outcome: form.get("outcome"), target: Number(form.get("target")), unit: form.get("unit") }, ...(previousGoalId ? { previousGoalId } : {}), ...(form.get("policyVersionId") ? { policyVersionId: form.get("policyVersionId") } : {}), ...(siaId && form.get("useSia") === "on" ? { siaId } : {}) }));
    const result = await applicationAction(s, form); if (result.success) router.refresh(); return result;
  }, {});
  return <form className="nj-form" action={action}><input type="hidden" name="realm" value={realm} />
    <label>Your 30-day outcome<input name="outcome" required minLength={3} maxLength={200} /></label>
    <label>Outcome quantity<input name="target" type="number" required min={1} max={1000000} step={1} /></label>
    <label>Unit<input name="unit" required maxLength={80} /></label>
    <label>Approved incentive rule (optional)<select name="policyVersionId"><option value="">Work goal only; no earnings rule selected</option>{policies.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    {siaId ? <label><input name="useSia" type="checkbox" defaultChecked /> Use authorized TARA planning assistance</label> : <p>{siaStatus === "NOT_AUTHORIZED" ? "TARA planning is not authorized for your account." : "TARA planning is not configured."} A standard planning draft is available for manager review.</p>}
    <label><input name="confirmed" type="checkbox" required disabled={pending || !!state.success} /> Prepare a proposal, not a promise of earnings</label>
    <button className="button" disabled={pending || !!state.success}>{pending ? "Preparing..." : previousGoalId ? "Propose target change" : "Prepare my plan"}</button>
    {state.error && <p role="alert">{state.error}</p>}{state.success && <p role="status">Plan drafted. Review it and request manager approval.</p>}
  </form>;
}
