"use client";
import { useSearchParams } from "next/navigation";
import { WorkspaceReturnFields } from "@/components/ui/workspace-return-fields";
import { useActionState, useEffect, useState } from "react";
import { Plus, Pencil, Eye, X, Check, ShieldCheck } from "lucide-react";
import type { WorkforceKind } from "@/server/domain/workforce-input";
import { saveWorkforceAction, assignAccessAction, explainAccessAction } from "./actions";
import { workforceFields } from "./fields";

export type WorkforceRow = Record<string, unknown> & { id: string };
type Option = { id: string; name: string; organizationId?: string; principalType?: string };
export type Workspace = {
  organizations: { id: string; name: string; type: string; parentId: string | null }[];
  people: { id: string; displayName: string }[];
  roles: { id: string; name: string; organizationId: string | null; principalType: string }[];
  projects: Option[]; products: Option[]; goals: { id: string; title: string; organizationId: string }[];
  permissions: { id: string; name: string; key: string }[];
  scopes: Record<string, string[]>; canCreatePermission: boolean;
};
const titles: Record<WorkforceKind, string> = { people: "People", users: "User accounts", memberships: "Memberships", roles: "Roles & designations", permissions: "Capabilities", access: "Access & role", reporting: "Reporting relationships", responsibilities: "Responsibilities", departments: "Departments", teams: "Teams", organizations: "Organizations", sia: "SIA access" };
const createKeys: Partial<Record<WorkforceKind, string>> = { people: "person.create", users: "user.create", roles: "role.create", memberships: "membership.manage", reporting: "reporting.manage", responsibilities: "responsibility.manage", organizations: "organization.manage", departments: "organization.manage", teams: "organization.manage" };
const updateKeys: Partial<Record<WorkforceKind, string>> = { ...createKeys, people: "person.update", users: "user.update", roles: "role.update" };
function text(value: unknown): string {
  if (value == null || value === "") return "Not recorded";
  if (typeof value === "object") { const row = value as WorkforceRow; return String(row.displayName ?? row.name ?? row.title ?? ""); }
  return String(value).replaceAll("_", " ");
}
function sources(workspace: Workspace): Record<string, Option[]> {
  return { organizations: workspace.organizations, people: workspace.people.map(p => ({ id: p.id, name: p.displayName })), roles: workspace.roles.map(r => ({ ...r, organizationId: r.organizationId ?? undefined })), projects: workspace.projects, products: workspace.products, goals: workspace.goals.map(g => ({ ...g, name: g.title })) };
}
function Assignment({ operation, row, workspace, organizationId }: { operation: "role" | "permission" | "sia"; row: WorkforceRow; workspace: Workspace; organizationId: string }) {
  const [state, action, pending] = useActionState(assignAccessAction, {});
  const roles = workspace.roles.filter(r => r.organizationId === organizationId && r.principalType === (operation === "sia" ? "AGENT" : "HUMAN"));
  return <form action={action} className="role-form">
    <input type="hidden" name="operation" value={operation}/>
    {operation === "role" && <input type="hidden" name="membershipId" value={row.id}/>}
    {operation === "permission" && <input type="hidden" name="roleId" value={row.id}/>}
    {operation === "sia" && <><input type="hidden" name="siaId" value={row.id}/><input type="hidden" name="organizationId" value={organizationId}/></>}
    <label>{operation === "permission" ? "Capability" : "Role"}<select name={operation === "permission" ? "permissionId" : "roleId"} required><option value="">Select...</option>{operation === "permission" ? workspace.permissions.map(p => <option key={p.id} value={p.id}>{p.name} ({p.key})</option>) : roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
    <button className="button" name="enabled" value="true" disabled={pending}><Check size={16}/>Assign</button><button className="button secondary" name="enabled" value="false" disabled={pending}>Revoke</button>
    {state.error && <p role="alert" className="error">{state.error}</p>}{state.success && <p role="status">Assignment updated.</p>}
  </form>;
}
function Editor({ kind, row, workspace, activeOrganization, close }: { kind: WorkforceKind; row?: WorkforceRow; workspace: Workspace; activeOrganization: string; close: () => void }) {
  const [state, action, pending] = useActionState(saveWorkforceAction, {});
  const [organization, setOrganization] = useState(String(row?.organizationId ?? activeOrganization));
  const options = sources(workspace);
  useEffect(() => { if (state.success) close(); }, [state.success, close]);
  return <section className="editor-band"><div className="view-heading"><h2>{row ? "Edit" : "New"} {kind === "people" ? "person" : kind === "users" ? "account" : "record"}</h2><button type="button" className="icon-button" onClick={close} aria-label="Close editor" title="Close editor"><X size={18}/></button></div>
    <form action={action} className="business-form"><input type="hidden" name="kind" value={kind}/><input type="hidden" name="recordId" value={row?.id ?? ""}/>
      {workforceFields[kind]?.filter(f => !row || f.key !== "copyRoleId").map(f => {
        const value = f.key === "password" ? "" : row?.[f.key] ?? (f.key === "organizationId" ? activeOrganization : "");
        const locked = !!row && (["organizationId", "parentId", "type"].includes(f.key) || ["memberships", "users"].includes(kind) && ["personId", "projectId"].includes(f.key) || kind === "roles" && (f.key === "principalType" || !!row.canonical && ["key", "name", "status"].includes(f.key)));
        let choices = f.source ? options[f.source] ?? [] : [];
        if (["projects", "products", "goals"].includes(f.source ?? "") && organization) choices = choices.filter(c => c.organizationId === organization);
        if (f.source === "organizations" && !row) {
          const key = createKeys[kind]; if (key) choices = choices.filter(c => workspace.scopes[key]?.includes(c.id));
        }
        const defaultValue = f.type === "date" && value ? String(value).slice(0,10) : String(value ?? "");
        return <label key={f.key} className={f.type === "textarea" ? "wide-field" : ""}>{f.label}
          {locked && <input type="hidden" name={f.key} value={defaultValue}/>}
          {f.source || f.values ? <select name={locked ? undefined : f.key} disabled={locked} required={f.required} defaultValue={defaultValue || f.values?.[0] || ""} onChange={f.key === "organizationId" ? e => setOrganization(e.target.value) : undefined}>
            {f.source && <option value="">Not assigned</option>}{f.source && !!defaultValue && !choices.some(c => c.id === defaultValue) && <option value={defaultValue}>Current assignment</option>}
            {choices.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}{f.values?.map(v => <option key={v} value={v}>{v === "AGENT" ? "Executive agent" : v === "HUMAN" ? "Human" : v === "DESCENDANTS" ? "This organization and descendants" : v === "ORGANIZATION" ? "This scope only" : text(v)}</option>)}
          </select> : f.type === "textarea" ? <textarea rows={3} name={f.key} defaultValue={defaultValue} maxLength={2000}/> : <input name={locked ? undefined : f.key} disabled={locked} type={f.type ?? "text"} defaultValue={defaultValue} required={f.required} minLength={f.type === "password" ? 12 : undefined} maxLength={f.type === "password" ? 72 : 200} autoComplete={f.type === "password" ? "new-password" : undefined}/>}
        </label>;
      })}
      {state.error && <p className="error wide-field" role="alert">{state.error}</p>}<div className="form-footer wide-field"><button className="button" type="submit" disabled={pending}><Check size={16}/>{pending ? "Saving..." : "Save"}</button><button className="button secondary" type="button" onClick={close}>Cancel</button></div>
    </form>
  </section>;
}
function AccessInspector({ users, workspace }: { users: WorkforceRow[]; workspace: Workspace }) {
  const [state, action, pending] = useActionState(explainAccessAction, {});
  return <section className="editor-band"><h2>Check access</h2><form action={action} className="business-form">
    <label>Account<select name="userId" required><option value="">Select...</option>{users.map(u => <option key={u.id} value={u.id}>{text(u.email)}</option>)}</select></label>
    <label>Access scope<select name="organizationId" required><option value="">Select...</option>{workspace.organizations.filter(o => workspace.scopes["access.explain"]?.includes(o.id)).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
    <label>Capability<select name="permission" required>{workspace.permissions.map(p => <option key={p.id} value={p.key}>{p.name} ({p.key})</option>)}</select></label>
    <label>Project<select name="projectId"><option value="">Organization scope</option>{workspace.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    <div className="wide-field"><button className="button" disabled={pending}><ShieldCheck size={16}/>Check access</button></div>
    {state.error && <p className="error wide-field" role="alert">{state.error}</p>}{state.decision && <p className="wide-field" role="status">{state.decision}</p>}
  </form></section>;
}
export function WorkforceManager({ kind, rows, workspace, activeOrganization, search, status, accounts = [] }: { kind: WorkforceKind; rows: WorkforceRow[]; workspace: Workspace; activeOrganization: string; search: string; status: string; accounts?: WorkforceRow[] }) {
  const returnQuery = useSearchParams();
  const [editing, setEditing] = useState<WorkforceRow | null | undefined>();
  const [details, setDetails] = useState<WorkforceRow | undefined>();
  useEffect(() => { setDetails(previous => previous ? rows.find(r => r.id === previous.id) : undefined); }, [rows]);
  const [siaScope, setSiaScope] = useState(activeOrganization);
  const createKey = createKeys[kind];
  const canCreate = kind === "permissions" ? workspace.canCreatePermission : !!createKey && (workspace.scopes[createKey]?.length ?? 0) > 0;
  const options = sources(workspace);
  const orgName = (id: unknown) => workspace.organizations.find(o => o.id === id)?.name ?? "Not recorded";
  const identity = (r: WorkforceRow) => text(r.displayName ?? r.email ?? r.name ?? r.person ?? r.title);
  return <>
    <div className="view-heading"><div><p className="eyebrow">People &amp; access</p><h1>{titles[kind]}</h1></div>{canCreate && <button className="button" onClick={() => setEditing(null)}><Plus size={16}/>New {kind === "people" ? "person" : kind === "users" ? "account" : "record"}</button>}</div>
    <form method="get" className="list-toolbar"><WorkspaceReturnFields query={Object.fromEntries(returnQuery.entries())}/><input name="search" aria-label="Search records" type="search" placeholder="Search" defaultValue={search}/>
      <select name="organization" aria-label="Active organization" defaultValue={activeOrganization}><option value="">All authorized organizations</option>{workspace.organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
      <select name="status" aria-label="Status" defaultValue={status}><option value="">All statuses</option>{["ACTIVE", "INACTIVE", "SUSPENDED", "ARCHIVED", "INVITED", "ENDED"].map(s => <option key={s} value={s}>{text(s)}</option>)}</select><button className="button secondary">Apply</button>
    </form>
    {editing !== undefined && <Editor key={editing?.id ?? "new"} kind={kind} row={editing ?? undefined} workspace={workspace} activeOrganization={activeOrganization} close={() => setEditing(undefined)}/>}
    {kind === "access" && workspace.scopes["access.explain"]?.length > 0 && <AccessInspector users={accounts} workspace={workspace}/>}
    {details && <section className="editor-band"><div className="view-heading"><h2>{identity(details)}</h2><button className="icon-button" title="Close details" aria-label="Close details" onClick={() => setDetails(undefined)}><X size={18}/></button></div>
      <dl className="record-details">{(workforceFields[kind] ?? []).filter(f => !["password", "copyRoleId"].includes(f.key)).map(f => <div key={f.key}><dt>{f.label}</dt><dd>{f.source ? options[f.source]?.find(o => o.id === details[f.key])?.name ?? "Not recorded" : text(details[f.key])}</dd></div>)}</dl>
      {(kind === "memberships" || kind === "access") && <><p>Assigned roles: {(details.roles as { role: { name: string } }[]).map(a => a.role.name).join(", ") || "None"}</p>{workspace.scopes["membership.assign_role"]?.includes(String(details.organizationId)) && <Assignment operation="role" row={details} workspace={workspace} organizationId={String(details.organizationId)}/>}</>}
      {kind === "roles" && <><p>Assigned capabilities: {(details.permissions as { permission: { name: string } }[]).map(a => a.permission.name).join(", ") || "None"}</p>{workspace.scopes["permission.assign"]?.includes(String(details.organizationId)) && <Assignment operation="permission" row={details} workspace={workspace} organizationId={String(details.organizationId)}/>}</>}
      {kind === "sia" && <><p>{text(details.title)}</p><p>Assigned roles: {(details.roleAssignments as { role: { name: string } }[]).map(a => a.role.name).join(", ") || "None"}</p><label>Access scope<select value={siaScope} onChange={e => setSiaScope(e.target.value)}><option value="">Select...</option>{workspace.organizations.filter(o => workspace.scopes["sia.access.manage"]?.includes(o.id)).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>{siaScope && <Assignment operation="sia" row={details} workspace={workspace} organizationId={siaScope}/>}</>}
    </section>}
    <p className="muted">{rows.length} records</p>
    {!rows.length ? <div className="business-empty"><ShieldCheck size={28}/><h2>No records</h2><p className="muted">No matching records in your authorized scope.</p></div> : <div className="table-scroll"><table className="business-table"><thead><tr><th>Identity</th><th>Context</th><th>Status</th><th>Details</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{rows.map(r => {
      const updateKey = updateKeys[kind]; const editable = !!updateKey && workspace.scopes[updateKey]?.includes(String(r.organizationId)) && !(kind === "roles" && !!r.system && !r.canonical) && !(kind === "organizations" && ["GROUP", "COMPANY"].includes(String(r.type)));
      return <tr key={r.id}><td><strong>{identity(r)}</strong>{r.canonical ? <small>Canonical AIRA designation</small> : null}</td><td>{kind === "permissions" ? text(r.scope) : kind === "reporting" ? text(r.manager) : kind === "users" ? text(r.person) : kind === "sia" ? "Executive agent" : orgName(r.organizationId)}{r.project ? <small>{text(r.project)}</small> : null}</td><td><span className="status">{text(r.status ?? "ACTIVE")}</span></td><td>{kind === "roles" ? text(r.principalType === "AGENT" ? "Executive agent" : r.category) : kind === "permissions" ? text(r.key) : kind === "memberships" || kind === "access" ? (r.roles as { role: { name: string } }[]).map(a => a.role.name).join(", ") || "No assigned role" : kind === "responsibilities" ? text(r.project ?? r.product ?? r.goal ?? "Organization") : text(r.profile ?? r.title ?? r.type ?? r.email)}</td><td><div className="row-actions"><button className="icon-button" title="View details" aria-label={"View " + identity(r)} onClick={() => setDetails(r)}><Eye size={16}/></button>{editable && <button className="icon-button" title="Edit record" aria-label={"Edit " + identity(r)} onClick={() => setEditing(r)}><Pencil size={16}/></button>}</div></td></tr>;
    })}</tbody></table></div>}
  </>;
}
