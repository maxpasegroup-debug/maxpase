"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Building2, Layers3, Plus, Pencil, Trash2, X, ArrowUpRight } from "lucide-react";
import type { HierarchyNode } from "@/server/group/boss-hierarchy";
import { saveBossHierarchyRecord } from "./hierarchy-actions";
import { removeBossRegistryRecord } from "./registry-actions";

export type HierarchyManagement = { companyCreate: boolean; companyIds: string[]; brandCompanyIds: string[] };
type Mode = "overview" | "create-company" | "edit-company" | "create-brand" | "edit-brand" | "remove";

function RecordForm({ node, kind, mode, onDone }: { node: HierarchyNode; kind: "company" | "brand"; mode: Mode; onDone: () => void }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(saveBossHierarchyRecord, {});
  useEffect(() => { if (state.success) { router.refresh(); onDone(); } }, [state.success, router, onDone]);
  const create = mode.startsWith("create");
  const target = create ? null : node;
  const companyId = kind === "brand" ? node.kind === "COMPANY" ? node.id : node.organizationId : undefined;
  const parentBrandId = kind === "brand" && create && node.kind === "BRAND" ? node.recordId : undefined;
  return <form action={action} className="boss-hierarchy-manage-form">
    <input type="hidden" name="kind" value={kind}/>
    {target?.recordId && <input type="hidden" name="recordId" value={target.recordId}/>}
    {companyId && <input type="hidden" name="organizationId" value={companyId}/>}
    {parentBrandId && <input type="hidden" name="parentBrandId" value={parentBrandId}/>}
    <p className="muted">{create ? `The new ${kind === "company" ? "company" : parentBrandId ? "sub-brand" : "brand"} starts inactive. Review its identity, ownership and access before activation.` : "Changes are audited and checked against current permissions."}</p>
    <div className="boss-hierarchy-form-grid">
      <label>{kind === "company" ? "Company display name" : "Brand name"}<input name="name" required maxLength={200} defaultValue={target?.displayName ?? target?.name ?? ""}/></label>
      <label>Identity slug<input name="slug" required maxLength={120} pattern="[a-z0-9]+(-[a-z0-9]+)*" defaultValue={target?.slug ?? ""} placeholder="example-brand"/></label>
      {kind === "company" ? <label>Registered legal name<input name="legalName" maxLength={200} defaultValue={target?.legalName ?? ""} placeholder="Enter only a verified legal name"/></label> : <label>Website (optional)<input name="website" type="url" maxLength={2000} defaultValue={target?.website ?? ""} placeholder="https://"/></label>}
      <label className="boss-hierarchy-form-wide">Description (optional)<textarea name="description" rows={3} maxLength={4000} defaultValue={target?.description ?? ""}/></label>
      {!create && <label>Status<select name="status" defaultValue={target?.status === "ACTIVE" ? "ACTIVE" : "INACTIVE"}><option value="INACTIVE">Inactive</option><option value="ACTIVE">Active</option></select></label>}
    </div>
    {state.error && <p role="alert" className="error">{state.error}</p>}
    <div className="boss-hierarchy-dialog-actions"><button type="submit" className="button" disabled={pending}>{pending ? "Saving…" : create ? "Create inactive record" : "Save changes"}</button><button type="button" className="button secondary" onClick={onDone}>Cancel</button></div>
  </form>;
}

function RemoveForm({ node, onDone }: { node: HierarchyNode; onDone: () => void }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(removeBossRegistryRecord, {});
  useEffect(() => { if (state.success) { router.refresh(); onDone(); } }, [state.success, router, onDone]);
  const company = node.kind === "COMPANY";
  return <form action={action} className="boss-hierarchy-manage-form">
    <input type="hidden" name="kind" value={company ? "company" : "brand"}/><input type="hidden" name="id" value={node.recordId}/>
    <p>{company ? "Legal companies retain their identity and audit history. You can archive an unlinked company; permanent deletion is unavailable." : "An empty brand can be permanently removed. Brands with child brands, products, projects or programmes must be closed through a controlled review."}</p>
    <label>Type REMOVE to confirm<input name="confirm" autoComplete="off" required pattern="REMOVE" placeholder="REMOVE"/></label>
    {state.error && <p role="alert" className="error">{state.error}</p>}
    <div className="boss-hierarchy-dialog-actions"><button type="submit" className="button secondary" name="mode" value="archive" disabled={pending || node.status === "ARCHIVED"}>Archive</button>{!company && <button type="submit" className="button" name="mode" value="delete" disabled={pending}>Delete empty brand</button>}<button type="button" className="button secondary" onClick={onDone}>Cancel</button></div>
  </form>;
}

export function HierarchyManager({ node, management, onClose, onSelect }: { node: HierarchyNode; management: HierarchyManagement; onClose: () => void; onSelect: (node: HierarchyNode) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<Mode>("overview");
  useEffect(() => { dialog.current?.showModal(); return () => { dialog.current?.close(); }; }, []);
  const canEdit = node.kind === "COMPANY" ? management.companyIds.includes(node.id) : node.kind === "BRAND" ? management.brandCompanyIds.includes(node.organizationId ?? "") : false;
  const canCreate = node.kind === "GROUP" ? management.companyCreate : node.kind === "COMPANY" ? management.brandCompanyIds.includes(node.id) : node.kind === "BRAND" ? management.brandCompanyIds.includes(node.organizationId ?? "") : false;
  const children = node.children.filter(child => node.kind === "GROUP" ? child.kind === "COMPANY" : child.kind === "BRAND" || child.kind === "UNIT");
  const title = mode === "overview" ? node.name : mode === "remove" ? `Remove ${node.name}` : mode.startsWith("create") ? mode === "create-company" ? "Add company" : node.kind === "BRAND" ? "Add sub-brand" : "Add brand" : `Edit ${node.name}`;
  const close = () => { dialog.current?.close(); onClose(); };
  return <dialog ref={dialog} className="boss-hierarchy-dialog" aria-labelledby="hierarchy-dialog-title" onCancel={onClose}>
    <div className="boss-hierarchy-dialog-head"><div><span className="eyebrow">{node.kind === "GROUP" ? "GROUP CONTROL" : node.kind === "COMPANY" ? "COMPANY CONTROL" : node.kind === "BRAND" ? "BRAND CONTROL" : "RECORDED STRUCTURE"}</span><h2 id="hierarchy-dialog-title">{title}</h2></div><button type="button" className="icon-button" aria-label="Close management dialog" onClick={close}><X size={20}/></button></div>
    {mode === "overview" ? <>
      <p className="muted">{node.kind === "GROUP" ? "Manage parent companies in the recorded group structure." : node.kind === "COMPANY" ? "Manage this company's brands and recorded divisions." : node.kind === "BRAND" ? "Manage this brand and its sub-brands. Open its operating centre for work and products." : "This division is a separate organization record. Brand ownership is managed at company level."}</p>
      <div className="boss-hierarchy-dialog-actions">{canCreate && <button type="button" className="button" onClick={() => setMode(node.kind === "GROUP" ? "create-company" : "create-brand")}><Plus size={17}/>{node.kind === "GROUP" ? "Add company" : node.kind === "BRAND" ? "Add sub-brand" : "Add brand"}</button>}{canEdit && <button type="button" className="button secondary" onClick={() => setMode(node.kind === "COMPANY" ? "edit-company" : "edit-brand")}><Pencil size={16}/>Edit</button>}{canEdit && <button type="button" className="button secondary" onClick={() => setMode("remove")}><Trash2 size={16}/>{node.kind === "COMPANY" ? "Archive / remove" : "Archive / delete"}</button>}<Link className="button secondary" href={node.href}>{node.kind === "GROUP" ? "View company list" : node.kind === "COMPANY" ? "Open company" : "Open workspace"}<ArrowUpRight size={16}/></Link></div>
      {children.length > 0 && <div className="boss-hierarchy-dialog-list"><h3>{node.kind === "GROUP" ? "Companies" : node.kind === "COMPANY" ? "Brands and divisions" : "Sub-brands"}</h3><ul>{children.map(child => <li key={child.id}><button type="button" onClick={() => { setMode("overview"); onSelect(child); }}>{child.kind === "COMPANY" || child.kind === "UNIT" ? <Building2 size={18}/> : <Layers3 size={18}/>}<span><strong>{child.name}</strong><small>{child.kind === "UNIT" ? "Division / business unit" : child.status}</small></span><ArrowUpRight size={16}/></button></li>)}</ul></div>}
      {!canCreate && !canEdit && <p className="muted">Management actions are unavailable under your current permissions.</p>}
    </> : mode === "remove" ? <RemoveForm node={node} onDone={close}/> : <RecordForm key={mode} node={node} kind={mode.endsWith("company") ? "company" : "brand"} mode={mode} onDone={close}/>}
    {mode !== "overview" && <button type="button" className="boss-hierarchy-dialog-back" onClick={() => setMode("overview")}>Back to {node.name}</button>}
  </dialog>;
}
