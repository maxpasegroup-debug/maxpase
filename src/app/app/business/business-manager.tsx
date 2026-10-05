"use client";
import { useActionState, useEffect, useState } from "react";
import { Plus, Pencil, X, Check, Building2, ChevronRight, Eye } from "lucide-react";
import type { BusinessKind } from "@/server/domain/business-input";
import { saveBusinessAction, setMembershipRoleAction } from "./actions";
import { fields } from "./form-fields";
export type Row = Record<string, unknown> & { id: string };
export type Option = { id: string; name: string; organizationId?: string };
export type Options = Record<string, Option[]>;
function label(value: unknown): string {
  if (value == null || value === "") return "Not recorded";
  if (typeof value === "object") {
    const row = value as Record<string, unknown>;
    return String(row.displayName ?? row.name ?? row.title ?? "");
  }
  return String(value).replaceAll("_", " ");
}
function Editor({ kind, row, options, close }: { kind: BusinessKind; row?: Row; options: Options; close: () => void }) {
  const [state, action, pending] = useActionState(saveBusinessAction, {});
  const [scope, setScope] = useState(String(row?.organizationId ?? ""));
  const [ownerType, setOwnerType] = useState(row?.ownerOrgId ? "organization" : "person");
  const [roleState, roleAction, rolePending] = useActionState(setMembershipRoleAction, {});
  useEffect(() => { if (state.success) close(); }, [state.success, close]);
  return <div className="editor-band">
    <div className="view-heading"><h2>{row ? "Edit record" : "New record"}</h2><button className="icon-button" onClick={close} title="Close editor" aria-label="Close editor"><X size={18}/></button></div>
    <form action={action} className="business-form">
      <input type="hidden" name="kind" value={kind}/><input type="hidden" name="recordId" value={row?.id ?? ""}/>
      {kind === "ownership" && <label>Owner entity<select value={ownerType} onChange={e => setOwnerType(e.target.value)}><option value="person">Person</option><option value="organization">Organization</option></select></label>}
      {fields[kind].filter(f => kind !== "ownership" || (f.key !== "ownerPersonId" || ownerType === "person") && (f.key !== "ownerOrgId" || ownerType === "organization")).map(f => {
        const source = f.source ? options[f.source] ?? [] : [];
        const choices = source.filter(o => !scope || !["brands", "products", "projects"].includes(f.source ?? "") || o.organizationId === scope);
        let value = row?.[f.key] ?? (f.key === "progress" ? 0 : "");
        if (f.type === "date" && value) value = String(value).slice(0,10);
        const isScope = f.key === "organizationId";
        const fixedGroup = !!row && f.key === "groupOrganizationId";
        return <label key={f.key} className={f.type === "textarea" ? "wide-field" : ""}>{f.label}
          {fixedGroup && <input type="hidden" name={f.key} value={String(value)}/>}
          {f.source || f.options ? <select name={fixedGroup ? undefined : f.key} disabled={fixedGroup} required={f.required} defaultValue={String(value || (f.options?.[0] ?? ""))} onChange={isScope ? e => setScope(e.target.value) : undefined}>
            {f.source && <option value="">{f.required ? "Select..." : "Not recorded"}</option>}
            {f.source && !!value && !choices.some(o => o.id === value) && <option value={String(value)}>Current assignment</option>}
            {choices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            {f.options?.map(o => <option key={o} value={o}>{label(o)}</option>)}
          </select> : f.type === "textarea" ? <textarea name={f.key} rows={3} defaultValue={String(value)} maxLength={4000}/> : <input name={f.key} type={f.type ?? "text"} defaultValue={String(value)} required={f.required} min={f.min} max={f.max} step={f.type === "number" ? "any" : undefined} maxLength={f.type === "text" || !f.type ? 200 : undefined}/>}
        </label>;
      })}
      {state.error && <p className="error wide-field" role="alert">{state.error}</p>}
      <div className="form-footer wide-field"><button className="button" type="submit" disabled={pending}><Check size={16}/>{pending ? "Saving..." : "Save"}</button><button type="button" className="button secondary" onClick={close}>Cancel</button></div>
    </form>
    {kind === "memberships" && row && (options.roles ?? []).some(r => r.organizationId === row.organizationId) && <form action={roleAction} className="role-form">
      <input type="hidden" name="membershipId" value={row.id}/>
      <label>Role<select name="roleId" required>{(options.roles ?? []).filter(r => r.organizationId === row.organizationId).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
      <button className="button" name="enabled" value="true" disabled={rolePending}>Assign role</button><button className="button secondary" name="enabled" value="false" disabled={rolePending}>Remove role</button>
      {roleState.error && <p role="alert" className="error">{roleState.error}</p>}{roleState.success && <p role="status">Role updated.</p>}
    </form>}
  </div>;
}
const titles: Record<BusinessKind, string> = { groups: "MAXPASE Group", companies: "Companies", organizations: "Organization structure", relationships: "Company relationships", ownership: "Ownership", people: "People", memberships: "Memberships", brands: "Brands", products: "Products & services", projects: "Projects", goals: "Goals" };
export function BusinessManager({ kind, rows, options, canManage }: { kind: BusinessKind; rows: Row[]; options: Options; canManage: boolean }) {
  const [editing, setEditing] = useState<Row | null | undefined>();
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState("");
  const [inspecting, setInspecting] = useState<Row | undefined>();
  const orgName = (id: unknown) => options.organizations.find(o => o.id === id)?.name ?? "Not recorded";
  const shown = rows.filter(r => JSON.stringify(r).toLowerCase().includes(search.toLowerCase()) && (!scope || r.organizationId === scope));
  const tree = (parent: string | null, depth = 0): React.ReactNode => {
    if (depth > rows.length) return null;
    return rows.filter(r => (r.parentId ?? null) === parent || (parent === null && r.parentId && !rows.some(n => n.id === r.parentId))).map(r => <li key={r.id}><div className="tree-node"><Building2 size={16}/><strong>{label(r.name)}</strong><span className="status">{label(r.type)}</span></div><ul>{tree(r.id, depth + 1)}</ul></li>);
  };
  return <>
    <div className="view-heading"><div><p className="eyebrow">Business universe</p><h1>{titles[kind]}</h1></div>{canManage && <button className="button" onClick={() => setEditing(null)}><Plus size={16}/>New record</button>}</div>
    {editing !== undefined && <Editor key={editing?.id ?? "new"} kind={kind} row={editing ?? undefined} options={options} close={() => setEditing(undefined)}/>}
    {inspecting && <section className="editor-band"><div className="view-heading"><h2>{label(inspecting.displayName ?? inspecting.name ?? inspecting.title ?? inspecting.person ?? inspecting.company)}</h2><button className="icon-button" onClick={() => setInspecting(undefined)} title="Close details" aria-label="Close details"><X size={18}/></button></div><dl className="record-details">{fields[kind].map(f => <div key={f.key}><dt>{f.label}</dt><dd>{f.source ? options[f.source]?.find(o => o.id === inspecting[f.key])?.name ?? "Not recorded" : label(inspecting[f.key])}</dd></div>)}{kind === "memberships" && <div><dt>Assigned roles</dt><dd>{(inspecting.roles as { role: { name: string } }[]).map(r => r.role.name).join(", ") || "No roles"}</dd></div>}</dl></section>}
    <div className="list-toolbar"><input aria-label="Search records" type="search" placeholder="Search records" value={search} onChange={e => setSearch(e.target.value)}/>{!["groups", "companies", "organizations", "relationships", "ownership", "people"].includes(kind) && <select aria-label="Filter organization" value={scope} onChange={e => setScope(e.target.value)}><option value="">All organizations</option>{options.organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select>}<span className="muted">{shown.length} records</span></div>
    {kind === "organizations" && !search && rows.length > 0 && <ul className="organization-tree">{tree(null)}</ul>}
    {!shown.length ? <div className="business-empty"><Building2 size={28}/><h2>No records</h2><p className="muted">{search || scope ? "No matching records." : "No records available in your authorized scope."}</p></div> :
    <div className="table-scroll"><table className="business-table"><thead><tr><th>Identity</th><th>Context</th><th>Status</th><th>Details</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{shown.map(r => <tr key={r.id}>
      <td><strong>{label(r.displayName ?? r.name ?? r.title ?? r.person ?? r.company ?? r.fromCompany)}</strong>{r.legalName ? <small>{String(r.legalName)}</small> : null}</td>
      <td>{kind === "relationships" ? <>{label(r.fromCompany)} <ChevronRight size={14}/> {label(r.toCompany)}</> : kind === "ownership" ? label(r.ownerPerson ?? r.ownerOrg) : kind === "groups" ? "Business ecosystem" : kind === "companies" ? orgName(r.groupOrganizationId) : kind === "organizations" ? orgName(r.parentId) : orgName(r.organizationId)}</td>
      <td><span className="status">{label(r.status ?? "ACTIVE")}</span></td>
      <td>{kind === "ownership" ? (r.percentage == null ? "Percentage not recorded" : String(r.percentage) + "%") : kind === "goals" ? <progress aria-label="Goal progress" max={100} value={Number(r.progress)}/> : label(r.relationship ?? r.lifecycle ?? r.type ?? r.description ?? r.scope)}</td>
      <td><div className="row-actions"><button className="icon-button" title="View details" aria-label={"View " + label(r.displayName ?? r.name ?? r.title ?? r.person ?? r.company ?? r.fromCompany)} onClick={() => setInspecting(r)}><Eye size={16}/></button>{canManage && kind !== "people" && <button className="icon-button" onClick={() => setEditing(r)} aria-label={"Edit " + label(r.displayName ?? r.name ?? r.title ?? r.person ?? r.company ?? r.fromCompany)} title="Edit record"><Pencil size={16}/></button>}</div></td>
    </tr>)}</tbody></table></div>}
  </>;
}
