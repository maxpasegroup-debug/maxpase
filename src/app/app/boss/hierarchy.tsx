"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Boxes, Building2, ChevronDown, ChevronRight, Layers3, List, Search, Shield, X } from "lucide-react";
import { Status } from "@/components/ui/status";
import { filterBossHierarchy, selectCompanyHierarchy, visibleHierarchyIds, type HierarchyNode } from "@/server/group/boss-hierarchy";
import { HierarchyManager, type HierarchyManagement } from "./hierarchy-manager";

function descendants(node: HierarchyNode): HierarchyNode[] { return [node, ...node.children.flatMap(descendants)]; }
function openPaths(node: HierarchyNode) { return new Set(descendants(node).filter(item => item.children.length).map(item => item.id)); }
function activeStructure(node: HierarchyNode): HierarchyNode { return { ...node, children: node.children.filter(child => child.status !== "ARCHIVED").map(activeStructure) }; }

function ChildCount({ node }: { node: HierarchyNode }) {
  const rows = descendants(node).slice(1);
  const units = rows.filter(row => row.kind === "UNIT" || row.kind === "BRAND").length;
  const products = rows.filter(row => row.kind === "PRODUCT" || row.kind === "SERVICE").length;
  return <span className="boss-hierarchy-node-count">{units} {units === 1 ? "brand / unit" : "brands / units"} · {products} {products === 1 ? "product / service" : "products / services"}</span>;
}

function HierarchyBranch({ node, expanded, onToggle, onManage, index = 0 }: { node: HierarchyNode; expanded: ReadonlySet<string>; onToggle: (id: string) => void; onManage: (node: HierarchyNode) => void; index?: number }) {
  const open = expanded.has(node.id);
  const isGroup = node.kind === "GROUP", isCompany = node.kind === "COMPANY";
  const kindLabel = node.kind === "UNIT" ? node.detail : node.kind === "SERVICE" ? "Service / program" : node.kind;
  return <li className={`boss-hierarchy-branch boss-hierarchy-${node.kind.toLowerCase()}${isCompany ? ` boss-hierarchy-company-theme-${index % 3}` : ""}`}>
    <div className="boss-hierarchy-node">
      <span className="boss-hierarchy-emblem" aria-hidden="true">{isGroup ? <span className="boss-hierarchy-monogram">M</span> : isCompany ? <Building2 size={28}/> : node.kind === "UNIT" ? <Building2 size={19}/> : node.kind === "BRAND" ? <Layers3 size={19}/> : node.kind === "SERVICE" ? <Shield size={19}/> : <Boxes size={19}/>}</span>
      {node.kind === "PRODUCT" || node.kind === "SERVICE" ? <Link prefetch={false} className="boss-hierarchy-link" href={node.href}><span className="boss-hierarchy-kind">{kindLabel}</span><strong>{node.name}</strong>{node.detail && <small>{node.detail}</small>}</Link> : <button type="button" className="boss-hierarchy-link boss-hierarchy-manage-trigger" onClick={() => onManage(node)} aria-label={`Manage ${node.name}`} aria-haspopup="dialog"><span className="boss-hierarchy-kind">{kindLabel}</span><strong>{node.name}</strong>{isGroup ? <small>Group operating structure</small> : node.detail && node.kind !== "UNIT" ? <small>{node.detail}</small> : null}</button>}
      <div className="boss-hierarchy-states"><Status value={node.status}/>{node.lifecycle && node.lifecycle !== node.status && <Status value={node.lifecycle}/>}</div>
      {node.children.length ? <button type="button" className="boss-hierarchy-toggle" aria-label={`${open ? "Collapse" : "Expand"} ${node.name}`} aria-expanded={open} aria-controls={`hierarchy-children-${node.id}`} onClick={() => onToggle(node.id)}>{open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</button> : null}
    </div>
    {isCompany && <div className="boss-hierarchy-company-summary"><ChildCount node={node}/><span>{open ? "Showing structure" : node.children.length ? "Expand to explore" : "No recorded descendants"}</span></div>}
    {!isCompany && !isGroup && node.children.length > 0 && <div className="boss-hierarchy-child-summary"><ChildCount node={node}/></div>}
    {node.children.length > 0 && open && <ul id={`hierarchy-children-${node.id}`} className={isGroup ? "boss-hierarchy-company-grid" : isCompany ? "boss-hierarchy-unit-grid" : "boss-hierarchy-product-list"}>{node.children.map((child, childIndex) => <HierarchyBranch key={child.id} node={child} expanded={expanded} onToggle={onToggle} onManage={onManage} index={childIndex}/>)}</ul>}
  </li>;
}

export function BossHierarchy({ root, selectedCompanyId, initialSearch = "", initialStatus = "", brandReadable, productReadable, management = { companyCreate: false, companyIds: [], brandCompanyIds: [] } }: { root: HierarchyNode; selectedCompanyId?: string; initialSearch?: string; initialStatus?: string; brandReadable: boolean; productReadable: boolean; management?: HierarchyManagement }) {
  const router = useRouter();
  const [search, setSearch] = useState(initialSearch);
  const [status, setStatus] = useState(initialStatus);
  const [selected, setSelected] = useState<HierarchyNode | null>(null);
  const companyRoot = useMemo(() => selectCompanyHierarchy(root, selectedCompanyId), [root, selectedCompanyId]);
  const [expanded, setExpanded] = useState<Set<string>>(() => initialSearch || initialStatus ? openPaths(companyRoot) : new Set([root.id, ...(selectedCompanyId ? [selectedCompanyId] : [])]));
  const filtered = useMemo(() => filterBossHierarchy(search || status ? companyRoot : selectedCompanyId ? { ...companyRoot, children: companyRoot.children.map(activeStructure) } : activeStructure(companyRoot), search, status), [companyRoot, search, status, selectedCompanyId]);
  const statuses = useMemo(() => [...new Set(descendants(root).flatMap(node => [node.status, node.lifecycle].filter((value): value is string => !!value)))].sort(), [root]);
  const shown = filtered ? visibleHierarchyIds(filtered, expanded).length - 1 : 0;
  const setSearchAndOpen = (value: string) => { setSearch(value); setExpanded(value || status ? openPaths(companyRoot) : new Set([root.id, ...(selectedCompanyId ? [selectedCompanyId] : [])])); };
  const setStatusAndOpen = (value: string) => { setStatus(value); setExpanded(value || search ? openPaths(companyRoot) : new Set([root.id, ...(selectedCompanyId ? [selectedCompanyId] : [])])); };
  const selectCompany = (id: string) => {
    const params = new URLSearchParams({ view: "companies" });
    if (id) params.set("companyId", id);
    if (search) params.set("hierarchySearch", search);
    if (status) params.set("hierarchyStatus", status);
    router.push(`/app/boss?${params}`);
  };
  return <section className="executive-band boss-hierarchy" aria-labelledby="boss-hierarchy-title">
    <header className="boss-hierarchy-heading"><div><p className="eyebrow">Recorded group structure</p><h2 id="boss-hierarchy-title">Companies &amp; Brands</h2><p className="muted">Select the Group, a company or a brand to manage it. New records begin inactive.</p></div><nav className="boss-detail-links" aria-label="Company registry">{management.companyCreate && <button type="button" className="button" onClick={() => setSelected(root)}>Manage group</button>}<Link prefetch={false} className="boss-hierarchy-list-link" href="/app/business/companies"><List size={16} aria-hidden="true"/>View company list</Link></nav></header>
    <div className="boss-hierarchy-filters">
      <label>Company<select value={selectedCompanyId ?? ""} onChange={event => selectCompany(event.target.value)}><option value="">All Companies</option>{root.children.map(company => <option key={company.id} value={company.id}>{company.name}{company.status === "ARCHIVED" ? " (Archived)" : ""}</option>)}</select></label>
      <label>Search hierarchy<span className="boss-hierarchy-search"><Search size={17} aria-hidden="true"/><input type="search" value={search} onChange={event => setSearchAndOpen(event.target.value)} placeholder="Company, brand, product or status"/>{search && <button type="button" aria-label="Clear hierarchy search" onClick={() => setSearchAndOpen("")}><X size={17}/></button>}</span></label>
      <label>Status<select value={status} onChange={event => setStatusAndOpen(event.target.value)}><option value="">All statuses</option>{statuses.map(value => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label>
    </div>
    <p className="boss-hierarchy-feedback" role="status" aria-live="polite">{shown ? `${shown} visible ${shown === 1 ? "node" : "nodes"} in the current view.` : filtered?.children.length && !expanded.has(root.id) ? "Group collapsed. Expand it to view companies." : search || status ? "No matching authorized records. Clear the search or status filter to see the selected company." : "No authorized company records are available."}</p>
    {!brandReadable || !productReadable ? <p className="muted">Some brand or product records are unavailable under your current permissions.</p> : null}
    {filtered && (filtered.children.length || (!search && !status)) ? <ul className={`boss-hierarchy-root boss-hierarchy-count-${Math.min(filtered.children.length, 3)}`}><HierarchyBranch node={filtered} expanded={expanded} onManage={setSelected} onToggle={id => setExpanded(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; })}/></ul> : <div className="boss-hierarchy-empty"><p>{search || status ? "No matching company, brand or product in this authorized scope." : "No company records are configured in this authorized scope."}</p></div>}
    {!filtered?.children.length && !selectedCompanyId && !search && !status && <p className="boss-hierarchy-empty">{root.children.length ? "No active company records are shown. Choose Archived in the status filter or open Group management to review retained records." : "No company records are configured in this authorized scope."}</p>}
    {selectedCompanyId && !search && !status && companyRoot.children[0]?.children.length === 0 && <p className="boss-hierarchy-empty">No authorized brands, business units or products are configured for this company.</p>}
    {selected && <HierarchyManager key={selected.id} node={selected} management={management} onClose={() => setSelected(null)} onSelect={setSelected}/>}
  </section>;
}
