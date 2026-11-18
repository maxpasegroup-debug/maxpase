"use client";

import { useActionState, useState } from "react";
import { hrAction, type HrState } from "../../hr-actions";

export function EmployeeRemoval({ employmentId, employeeName, canArchive, canDeletePermanently }: { employmentId: string; employeeName: string; canArchive: boolean; canDeletePermanently: boolean }) {
  const [state, action, pending] = useActionState(hrAction, {} as HrState);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"archive" | "permanent">(canArchive ? "archive" : "permanent");
  if (!canArchive && !canDeletePermanently) return null;

  return <>
    <button type="button" className="button secondary boss-hr-remove-trigger" onClick={() => setOpen(true)}>Remove employee</button>
    {open && <div className="boss-hr-remove-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !pending) setOpen(false); }}>
      <section className="boss-hr-remove-dialog" role="dialog" aria-modal="true" aria-labelledby="hr-remove-title">
        <button type="button" className="boss-hr-remove-close" aria-label="Close" disabled={pending} onClick={() => setOpen(false)}>×</button>
        <p className="eyebrow">PEOPLE / REMOVE EMPLOYEE</p>
        <h2 id="hr-remove-title">Remove {employeeName}?</h2>
        <p>Choose what happens to this employee record.</p>
        <form action={action}>
          <input type="hidden" name="intent" value="remove-employee" />
          <input type="hidden" name="employmentId" value={employmentId} />
          <fieldset className="boss-hr-remove-options">
            <legend>Removal option</legend>
            {canArchive && <label className={mode === "archive" ? "selected" : ""}>
              <input type="radio" name="mode" value="archive" checked={mode === "archive"} onChange={() => setMode("archive")} />
              <span><strong>Remove and keep employee history</strong><small>Ends employment, removes company workspace access, and keeps the employee profile and history in the directory.</small></span>
            </label>}
            {canDeletePermanently && <label className={mode === "permanent" ? "selected danger" : "danger"}>
              <input type="radio" name="mode" value="permanent" checked={mode === "permanent"} onChange={() => setMode("permanent")} />
              <span><strong>Remove permanently</strong><small>Deletes this HR employment and its assignments. Shared account identity and audit records remain. Permanent removal is blocked when documents, payroll, compensation, or letters must be retained.</small></span>
            </label>}
          </fieldset>
          {mode === "archive" && <label className="boss-hr-remove-confirm"><input type="checkbox" required /> I understand the employee will lose access to this company workspace.</label>}
          {mode === "permanent" && <label className="boss-hr-remove-confirm">Type <strong>DELETE</strong> to confirm<input name="confirmation" autoComplete="off" required pattern="DELETE" title="Type DELETE exactly" /></label>}
          {state.error && <p role="alert" className="boss-hr-remove-error">{state.error}</p>}
          <div className="boss-hr-remove-actions"><button type="button" className="button secondary" disabled={pending} onClick={() => setOpen(false)}>Cancel</button><button type="submit" className="button danger-button" disabled={pending || (mode === "permanent" && !canDeletePermanently)}>{pending ? "Removing…" : mode === "archive" ? "Remove and keep history" : "Permanently remove"}</button></div>
        </form>
      </section>
    </div>}
  </>;
}
