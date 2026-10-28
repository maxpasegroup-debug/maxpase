"use client";
import { useActionState } from "react";
import { removeBossRegistryRecord } from "./registry-actions";

export function RegistryControls({ kind, id, archived }: { kind: "company" | "brand"; id: string; archived: boolean }) {
  const [state, action, pending] = useActionState(removeBossRegistryRecord, {});
  return <section className="executive-band"><h2>Record lifecycle</h2><p>{kind === "company" ? "Legal company records retain their identity and audit history. Only an unlinked company can be archived here; linked companies need a separate controlled review." : "Archive a brand after closing active work, or permanently remove it only if it has no linked products, projects or programmes."}</p>
    <form action={action} className="business-form"><input type="hidden" name="kind" value={kind}/><input type="hidden" name="id" value={id}/>
      <label>Confirmation<input name="confirm" placeholder="Type REMOVE" required autoComplete="off"/></label>
      <div className="form-footer"><button className="button secondary" name="mode" value="archive" disabled={pending || archived}>Archive</button>{kind === "brand" && <button className="button secondary" name="mode" value="delete" disabled={pending}>Permanently remove empty brand</button>}</div>
      {state.error && <p role="alert" className="error">{state.error}</p>}{state.success && <p role="status">{state.success}</p>}
    </form>
  </section>;
}
