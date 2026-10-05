"use client";
import { useActionState, useState, type ReactNode } from "react";
import { Save, Send, X, Play, Archive } from "lucide-react";
import { communicationAction } from "./actions";
export function CommunicationForm({ command, children, label = "Save", organizationId, id, version }: { command: string; children?: ReactNode; label?: string; organizationId?: string; id?: string; version?: number }) {
  const [state, action, pending] = useActionState(communicationAction, { ok: false, message: "" });
  const Icon = command === "confirm" || command === "delivery" ? Send : command === "cancel" || command === "pauseJob" ? X : command.startsWith("process") ? Play : command === "archive" ? Archive : Save;
  return <form action={action} className="communication-form" onSubmit={event => { if (["cancel", "archive", "pauseJob"].includes(command) && !window.confirm(`${label}?`)) event.preventDefault(); }}>
    <input type="hidden" name="command" value={command} />
    {organizationId && <input type="hidden" name="organizationId" value={organizationId} />}
    {id && <input type="hidden" name="id" value={id} />}
    {version !== undefined && <input type="hidden" name="version" value={version} />}
    {children}
    <button className="button secondary" type="submit" disabled={pending}><Icon size={16} aria-hidden="true" />{pending ? "Saving..." : label}</button>
    {state.message && <p role={state.ok ? "status" : "alert"} className={state.ok ? "muted" : "error-text"}>{state.message}</p>}
  </form>;
}
export function Composer({ templates, children, idempotencyKey, initial }: { templates: { id: string; name: string; variables: string }[]; children: ReactNode; idempotencyKey: string; initial?: { subject: string | null; content: string } }) {
  const [templateId, setTemplateId] = useState("");
  const [key, setKey] = useState(idempotencyKey);
  const variables: string[] = JSON.parse(templates.find(t => t.id === templateId)?.variables ?? "[]");
  return <div onChange={() => setKey(crypto.randomUUID())} className="communication-fields">
    <input type="hidden" name="idempotencyKey" value={key} />
    {children}
    <label>Template<select name="templateId" value={templateId} onChange={e => setTemplateId(e.target.value)}><option value="">None</option>{templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
    {variables.map(v => <label key={v}>{v}<input name={"variable:" + v} maxLength={1000} required /></label>)}
    {!templateId && <><label>Subject<input name="subject" maxLength={200} defaultValue={initial?.subject ?? ""} /></label><label className="wide">Message<textarea name="content" maxLength={4000} rows={5} defaultValue={initial?.content ?? ""} required /></label></>}
  </div>;
}
