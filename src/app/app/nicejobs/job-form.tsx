"use client";
import { useActionState } from "react";
import { Save, Check, Plus, Pause, Archive, Copy } from "lucide-react";
import { niceJobsAction } from "./actions";
export function JobForm({ children, realm, operation, id, revision, label = "Save", confirm = false }: { children?: React.ReactNode; realm: string; operation: string; id?: string; revision?: number; label?: string; confirm?: boolean }) {
  const [state, action, pending] = useActionState(niceJobsAction, {});
  const Icon = operation === "create" || operation === "seed" ? Plus : operation === "version" ? Copy : label === "Publish" ? Check : label === "Pause" ? Pause : label === "Archive" ? Archive : Save;
  return <form action={action} className="nj-form" onSubmit={e => { if (confirm && !window.confirm(`${label}? This records a controlled business change.`)) e.preventDefault(); }}>
    <input type="hidden" name="realm" value={realm} /><input type="hidden" name="operation" value={operation} />{id && <input type="hidden" name="id" value={id} />}{revision !== undefined && <input type="hidden" name="revision" value={revision} />}
    {children}<button className="button" type="submit" disabled={pending}><Icon size={16} aria-hidden="true" />{pending ? "Saving..." : label}</button>
    {state.error && <p role="alert">{state.error}</p>}{state.success && <p role="status">{state.success}</p>}
  </form>;
}
