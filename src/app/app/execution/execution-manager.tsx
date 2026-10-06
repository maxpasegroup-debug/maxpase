"use client";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { workspaceHref } from "@/lib/workspace-navigation";
import { withinOrganization } from "@/lib/work-list";
import Link from "next/link";
import { Plus, Pencil, X, Save, Eye, Trash2 } from "lucide-react";
import { saveExecutionAction } from "./actions";
import { fields } from "./fields";
export type Row = Record<string, unknown> & { id: string };
export type Option = { id: string; name: string; organizationId?: string; projectId?: string | null; parentId?: string | null };
export type Workspace = { scopes: Record<string, { organizations: string[]; projects: string[] }>; options: Record<string, Option[]>; history: Record<string, Row[]> };
const domain: Record<string, string> = { projects: "project", tasks: "task", milestones: "milestone", goals: "goal", dependencies: "dependency", blockers: "blocker", members: "membership", responsibilities: "responsibility" };
export const titleFor = (kind: string) => kind[0].toUpperCase() + kind.slice(1);
const readable = (v: unknown) => v == null || v === "" ? "Not recorded" : typeof v === "object" ? String((v as Row).displayName ?? (v as Row).name ?? (v as Row).title ?? "") : String(v).replaceAll("_", " ");
function permitted(w: Workspace, key: string, row?: Row) {
  const s = w.scopes[key];
  return !!s && (row ? s.organizations.includes(String(row.organizationId)) || s.projects.includes(String(row.scopeProjectId ?? row.projectId ?? row.id)) : s.organizations.length + s.projects.length > 0);
}
function Editor({ kind, row, w, close, projectId, progress = false }: { kind: string; row?: Row; w: Workspace; close: (saved?: boolean) => void; projectId?: string; progress?: boolean }) {
  const query = useSearchParams();
  const [state, action, pending] = useActionState(saveExecutionAction, {});
  const submitted = useRef(false);
  useEffect(() => { if (!pending) submitted.current = false; }, [pending, state]);
  const [organization, setOrganization] = useState(String(row?.organizationId ?? w.options.projects.find(p => p.id === projectId)?.organizationId ?? query.get("organizationId") ?? ""));
  const [project, setProject] = useState(String(row?.scopeProjectId ?? row?.projectId ?? projectId ?? ""));
  const [progressMode, setProgressMode] = useState(String(row?.progressMode ?? "MANUAL"));
  const [targetType, setTargetType] = useState(row?.taskId ? "taskId" : row?.goalId ? "goalId" : row?.milestoneId ? "milestoneId" : "projectId");
  useEffect(() => { if (state.success) close(true); }, [state.success, close]);
  const columns = progress ? [{ key: "progress", label: "Manual progress (%)", type: "number" }, { key: "progressReason", label: "Reason", type: "textarea" }] : fields[kind];
  return <section className="editor-band"><div className="view-heading"><h2>{progress ? "Record progress" : row ? "Edit record" : "New record"}</h2><button className="icon-button" type="button" title="Close" aria-label="Close" onClick={() => close()}><X size={18}/></button></div>
    <form method="post" className="business-form" aria-busy={pending} onSubmit={event => {
      event.preventDefault();
      if (submitted.current || pending) return;
      const form = new FormData(event.currentTarget);
      if (["CANCELLED", "ARCHIVED", "COMPLETED", "ACHIEVED", "MISSED"].includes(String(form.get("status"))) && !window.confirm("Confirm this status change?")) return;
      submitted.current = true;
      startTransition(() => action(form));
    }}><input type="hidden" name="kind" value={kind}/><input type="hidden" name="recordId" value={row?.id ?? ""}/><input type="hidden" name="operation" value={progress ? "progress" : "save"}/>
      {["blockers", "responsibilities"].includes(kind) && <label>Target<select value={targetType} disabled={!!row} onChange={e => setTargetType(e.target.value)}><option value="projectId">Project</option><option value="taskId">Task</option><option value="goalId">Goal</option>{kind === "responsibilities" && <option value="milestoneId">Milestone</option>}</select></label>}
      {columns.filter(f => !["blockers", "responsibilities"].includes(kind) || !["projectId", "taskId", "goalId", "milestoneId"].includes(f.key) || f.key === targetType).map(f => {
        const field = f as typeof fields[string][number];
        const value = row?.[field.key] ?? (field.key === "projectId" ? project : field.key === "organizationId" ? organization : field.key === "priority" ? "NORMAL" : field.key === "sequence" ? 0 : field.key === "progress" ? row?.calculatedProgress ?? 0 : "");
        const locked = !!row && (["organizationId"].includes(field.key) || kind !== "projects" && field.key === "projectId" || kind === "members" && field.key === "personId" || kind === "blockers" && ["taskId", "goalId"].includes(field.key));
        let options = field.source ? w.options[field.source] ?? [] : [];
        if (field.source === "organizations") options = options.filter(o => w.scopes[domain[kind] + ".manage"]?.organizations.includes(o.id) || w.options.projects.some(p => p.organizationId === o.id && w.scopes[domain[kind] + ".manage"]?.projects.includes(p.id)));
        const company = query.get("companyId") ?? query.get("organizationId");
        if (field.source === "organizations" && company) options = options.filter(o => withinOrganization(o.id, company, w.options.organizations));
        if (field.source === "projects") options = options.filter(o => permitted(w, domain[kind] + ".manage", { id: o.id, organizationId: o.organizationId, projectId: o.id }));
        if (["projects", "products", "brands"].includes(field.source ?? "") && organization) options = options.filter(o => o.organizationId === organization);
        if (["milestones", "tasks"].includes(field.source ?? "") && project) options = options.filter(o => o.projectId === project);
        if (field.key === "parentGoalId") options = options.filter(o => o.id !== row?.id);
        const v = field.type === "date" && value ? String(value).slice(0, 10) : String(value ?? "");
        return <label key={field.key} className={field.type === "textarea" ? "wide-field" : ""}>{field.label}
          {locked && <input type="hidden" name={field.key} value={v}/>}
          {field.source || field.values ? <select name={locked ? undefined : field.key} disabled={locked} required={field.required} {...(["organizationId", "projectId"].includes(field.key) && !locked ? { value: field.key === "organizationId" ? organization : project } : { defaultValue: v || field.values?.[0] || "" })} onChange={e => { if (field.key === "organizationId") { setOrganization(e.target.value); setProject(""); } if (field.key === "projectId") { setProject(e.target.value); const selected = w.options.projects.find(p => p.id === e.target.value); if (selected?.organizationId) setOrganization(selected.organizationId); } if (field.key === "progressMode") setProgressMode(e.target.value); }}>
            {field.source && <option value="">Not assigned</option>}{field.source && v && !options.some(o => o.id === v) && <option value={v}>Current assignment</option>}{options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}{field.values?.map(v => <option key={v} value={v}>{readable(v)}</option>)}
          </select> : field.type === "textarea" ? <textarea name={field.key} rows={3} maxLength={4000} required={field.required} defaultValue={v}/> : <input name={field.key} type={field.type ?? "text"} required={field.required} defaultValue={v} min={field.type === "number" ? 0 : undefined} max={field.key === "progress" ? 100 : undefined} step={field.type === "number" ? "any" : undefined} maxLength={200}/>}
        </label>;
      })}
      {!progress && kind === "goals" && !row && progressMode === "MANUAL" && permitted(w, "goal.progress") && <><label>Manual progress (%)<input name="progress" type="number" min={0} max={100} step="any" defaultValue={0}/></label><label>Progress reason<textarea name="progressReason" maxLength={4000}/></label></>}
      {row && !progress && ["COMPLETED", "CANCELLED", "ARCHIVED", "ACHIEVED", "MISSED"].includes(String(row.status)) && permitted(w, domain[kind] + ".reopen", row) && <label className="checkbox-field wide-field"><input type="checkbox" name="reopen" required/>Reopen work</label>}
      {state.error && <p className="error wide-field" role="alert">{state.error}</p>}<div className="form-footer wide-field"><button className="button" disabled={pending}><Save size={16}/>{pending ? "Saving..." : "Save"}</button><button type="button" className="button secondary" onClick={() => close()}>Cancel</button></div>
    </form></section>;
}
function RemoveDependency({ row }: { row: Row }) {
  const [state, action, pending] = useActionState(saveExecutionAction, {});
  return <form action={action}><input type="hidden" name="kind" value="dependencies"/><input type="hidden" name="operation" value="remove"/><input type="hidden" name="taskId" value={String(row.taskId)}/><input type="hidden" name="prerequisiteId" value={String(row.prerequisiteId)}/><button className="icon-button" disabled={pending} title="Remove dependency" aria-label="Remove dependency"><Trash2 size={16}/></button>{state.error && <p className="error" role="alert">{state.error}</p>}</form>;
}
export function ExecutionManager({ kind, rows, workspace: w, projectId, compact = false }: { kind: string; rows: Row[]; workspace: Workspace; projectId?: string; compact?: boolean }) {
  const query = useSearchParams();
  const href = (path: string) => workspaceHref(path, query.get("companyId") ?? query.get("organizationId") ?? undefined, query.get("returnView") ?? undefined, new URLSearchParams(query.toString()));
  const [editing, setEditing] = useState<Row | null | undefined>(query.get("create") === "true" && permitted(w, domain[kind] + ".manage") ? null : undefined);
  const [inspect, setInspect] = useState<Row | null>(null);
  const [progress, setProgress] = useState(false);
  const [feedback, setFeedback] = useState("");
  const label = (id: unknown, source: string) => w.options[source]?.find(o => o.id === id)?.name ?? (id ? "Assigned" : "Not assigned");
  return <section className={compact ? "section" : ""}><div className="view-heading">{compact ? <h2>{titleFor(kind)}</h2> : <div><p className="eyebrow">Execution workspace</p><h1>{titleFor(kind)}</h1></div>}{permitted(w, domain[kind] + ".manage") && <button className="button" onClick={() => { setEditing(null); setProgress(false); }}><Plus size={16}/>New</button>}</div>
    {feedback && <p role="status">{feedback}</p>}
    {editing !== undefined && <Editor key={editing?.id ?? "new"} kind={kind} row={editing ?? undefined} w={w} projectId={projectId ?? query.get("projectId") ?? undefined} progress={progress} close={saved => { setEditing(undefined); if (saved) setFeedback("Work saved."); }}/>}
    {inspect && <section className="editor-band"><div className="view-heading"><h2>{readable(inspect.name ?? inspect.title ?? inspect.description ?? "Record")}</h2><button className="icon-button" title="Close details" aria-label="Close details" onClick={() => setInspect(null)}><X size={16}/></button></div><dl className="record-details">{Object.entries(inspect).filter(([k]) => !["id", "project", "task", "goal", "roles", "person"].includes(k)).map(([k, v]) => <div key={k}><dt>{fields[kind]?.find(f => f.key === k)?.label ?? k}</dt><dd>{k.endsWith("PersonId") ? label(v, "people") : k.endsWith("Date") || k.endsWith("At") ? v ? new Date(String(v)).toISOString() : "Not recorded" : readable(v)}</dd></div>)}</dl>{kind === "goals" && <><h3>Progress history</h3>{w.history[inspect.id]?.length ? w.history[inspect.id].map(h => <p key={h.id}>{String(h.value)}% · {readable(h.actor)} · {new Date(String(h.createdAt)).toISOString()}<br/>{readable(h.reason)}</p>) : <p className="muted">No manual updates recorded.</p>}</>}</section>}
    {!rows.length ? <div className="business-empty"><h2>No {kind} found</h2></div> : <div className="table-scroll" role="region" aria-label={`${kind} records`} tabIndex={0}><table className="business-table"><thead><tr><th>{kind === "dependencies" ? "Task / prerequisite" : "Work"}</th><th>Scope</th><th>Status / priority</th><th>People</th><th>Deadline (UTC)</th>{["projects", "milestones", "goals"].includes(kind) && <th>Progress</th>}<th><span className="sr-only">Actions</span></th></tr></thead><tbody>{rows.map(r => <tr key={r.id}>
      <td>{kind === "projects" ? <Link prefetch={false} href={href(`/app/execution/projects/${r.id}`)}><strong>{readable(r.name)}</strong></Link> : <strong>{readable(r.title ?? r.name ?? r.description ?? r.person ?? r.task)}</strong>}{kind === "dependencies" && <small>Depends on {readable(r.prerequisite)}</small>}<nav className="boss-detail-links" aria-label="Follow up">{[["reminder.manage", "Set reminder", "reminders"], ["escalation.manage", "Escalate", "escalations"]].filter(([permission]) => ["projects", "tasks", "goals"].includes(kind) && permitted(w, permission, r)).map(([, title, target]) => <Link prefetch={false} key={target} href={href(`/app/operations/${target}?create=true&targetId=${encodeURIComponent(r.id)}&organizationId=${encodeURIComponent(String(r.organizationId))}`)}>{title}</Link>)}</nav></td>
      <td>{label(r.organizationId, "organizations")}<small>{label(r.scopeProjectId ?? r.projectId, "projects")}</small></td><td><span className="status">{readable(r.status)}</span><small>{readable(r.priority)}</small></td><td>{label(r.ownerPersonId ?? r.personId, "people")}<small>{kind === "tasks" ? "Assignee: " + label(r.assigneePersonId, "people") : "Accountable: " + label(r.accountablePersonId, "people")}</small></td><td>{r.dueDate || r.targetDate || r.expectedResolution ? String(r.dueDate ?? r.targetDate ?? r.expectedResolution).slice(0, 10) : "Not set"}</td>
      {["projects", "milestones", "goals"].includes(kind) && <td>{r.calculatedProgress == null ? "Unknown" : <><progress max={100} value={Number(r.calculatedProgress)}/><small>{Number(r.calculatedProgress).toFixed(1)}% {kind === "goals" && r.progressMode === "MANUAL" ? "manual" : "derived"}</small></>}</td>}
      <td><div className="row-actions"><button className="icon-button" title="Details" aria-label="Details" onClick={() => setInspect(r)}><Eye size={16}/></button>{permitted(w, domain[kind] + ".manage", r) && (kind === "dependencies" ? <RemoveDependency row={r}/> : <button className="icon-button" title="Edit" aria-label="Edit" onClick={() => { setEditing(r); setProgress(false); }}><Pencil size={16}/></button>)}{kind === "goals" && r.progressMode === "MANUAL" && permitted(w, "goal.progress", r) && <button className="icon-button" title="Record progress" aria-label="Record progress" onClick={() => { setEditing(r); setProgress(true); }}><Plus size={16}/></button>}</div></td>
    </tr>)}</tbody></table></div>}{kind === "members" && <p className="section"><Link prefetch={false} className="button secondary" href="/app/workforce/access">Manage member capabilities</Link></p>}</section>;
}
