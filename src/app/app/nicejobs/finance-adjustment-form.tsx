"use client";
import { startTransition, useActionState } from "react";
import { useRouter } from "next/navigation";
import { applicationAction, type ApplicationActionState } from "./application-actions";
import { toMinor, type currencyDigits } from "@/server/nicejobs/money";
export function FinanceAdjustmentForm({ realm, walletId, currency, policies, canPrivate, requestId }: { realm: string; walletId: string; currency: keyof typeof currencyDigits; policies: { id: string; name: string }[]; canPrivate: boolean; requestId: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(async (s: ApplicationActionState, f: FormData) => {
    try {
      const get = (k: string) => String(f.get(k) ?? "");
      f.set("operation", "FINANCE"); f.set("command", JSON.stringify({ operation: "ADJUSTMENT_CREATE", walletId, policyVersionId: get("policyVersionId"), direction: get("direction"), amountMinor: toMinor(get("amount"), currency), reason: get("reason"), description: get("description"), ...(canPrivate && get("privateNote") ? { privateNote: get("privateNote") } : {}), confirmed: f.get("confirmed") === "on", idempotencyKey: requestId }));
      const result = await applicationAction(s, f); if (result.success) router.refresh(); return result;
    } catch { return { error: "Enter a positive amount with the correct currency precision." }; }
  }, {});
  return <form className="nj-form" onSubmit={e => { e.preventDefault(); if (pending || state.success) return; const f = new FormData(e.currentTarget); startTransition(() => action(f)); }}><input type="hidden" name="realm" value={realm} /><label>Adjustment policy<select aria-label="Adjustment policy" name="policyVersionId" required><option value="">Select</option>{policies.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Direction<select aria-label="Direction" name="direction" required><option value="">Select</option><option value="CREDIT">Credit</option><option value="DEBIT">Debit</option></select></label><label>Amount ({currency})<input aria-label={"Amount (" + currency + ")"} name="amount" required inputMode="decimal" maxLength={30} /></label><label>Worker-visible description<input aria-label="Worker-visible description" name="description" required maxLength={2000} /></label><label>Reason<textarea aria-label="Reason" name="reason" required maxLength={2000} /></label>{canPrivate && <label>Private management note<textarea aria-label="Private management note" name="privateNote" maxLength={2000} /></label>}<label><input name="confirmed" type="checkbox" required disabled={pending || !!state.success} /> Confirm adjustment proposal for independent review</label><button className="button" disabled={pending || !!state.success}>{pending ? "Saving..." : "Create adjustment proposal"}</button>{state.error && <p role="alert">{state.error}</p>}{state.success && <p role="status">{state.success}</p>}</form>;
}
