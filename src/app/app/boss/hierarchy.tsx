"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Search, X } from "lucide-react";
import { Status } from "@/components/ui/status";
import { filterBossHierarchy, selectCompanyHierarchy, visibleHierarchyIds, type HierarchyNode } from "@/server/group/boss-hierarchy";

function descendants(node: HierarchyNode): HierarchyNode[] { return [node, ...node.children.flatMap(descendants)]; }
function openPaths(node: HierarchyNode) { return new Set(descendants(node).filter(item => item.children.length).map(item => item.id)); }

function HierarchyBranch({ node, expanded, onToggle }: { node: HierarchyNode; expanded: ReadonlySet<string>; onToggle: (id: string) => void }) {
  const open = expanded.has(node.id);
  return <li className={`boss-hierarchy-branch boss-hierarchy-${node.kind.toLowerCase()}`}>
    <div className="boss-hierarchy-node">
      {node.children.length ? <button type="button" className="boss-hierarchy-toggle" aria-label={`${open ? "Collapse" : "Expand"} ${node.name}`} aria-expanded={open} aria-controls={`hierarchy-children-${node.id}`} onClick={() => onToggle(node.id)}>{open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</button> : <span className="boss-hierarchy-toggle-spacer" aria-hidden="true" />}
      <Link prefetch={false} className="boss-hierarchy-link" href={node.href}><span className="boss-hierarchy-kind">{node.kind === "UNIT" ? node.detail : node.kind === "SERVICE" ? "Service / program" : node.kind.toLowerCase()}</span><strong>{node.name}</strong>{node.detail && node.kind !== "UNIT" && <small>{node.detail}</small>}</Link>
      <div className="boss-hierarchy-states"><Status value={node.status}/>{node.lifecycle && node.lifecycle !== node.status && <Status value={node.lifecycle}/>}</div>
    </div>
    {node.children.length > 0 && open && <ul id={`hierarchy-children-${node.id}`} className="boss-hierarchy-children">{node.children.map(child => <HierarchyBranch key={child.id} node={child} expanded={expanded} onToggle={onToggle}/>)}</ul>}
  </li>;
}

export function BossHierarchy({ root, selectedCompanyId, initialSearch = "", initialStatus = "", brandReadable, productReadable }: { root: HierarchyNode; selectedCompanyId?: string; initialSearch?: string; initialStatus?: string; brandReadable: boolean; productReadable: boolean }) {
  const router = useRouter();
  const [search, setSearch] = useState(initialSearch);
  const [status, setStatus] = useState(initialStatus);
  const companyRoot = useMemo(() => selectCompanyHierarchy(root, selectedCompanyId), [root, selectedCompanyId]);
  const [expanded, setExpanded] = useState<Set<string>>(() => initialSearch || initialStatus ? openPaths(companyRoot) : new Set([root.id, ...(selectedCompanyId ? [selectedCompanyId] : [])]));
  const filtered = useMemo(() => filterBossHierarchy(companyRoot, search, status), [companyRoot, search, status]);
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
    <header className="boss-hierarchy-heading"><div><p className="eyebrow">Recorded group structure</p><h2 id="boss-hierarchy-title">Companies &amp; Brands</h2><p className="muted">Explore authorized registry relationships. A concept or inactive record is not a published offering.</p></div><span className="boss-hierarchy-count">{root.children.length} authorized companies</span></header>
    <div className="boss-hierarchy-filters">
      <label>Company<select value={selectedCompanyId ?? ""} onChange={event => selectCompany(event.target.value)}><option value="">All Companies</option>{root.children.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
      <label>Search hierarchy<span className="boss-hierarchy-search"><Search size={17} aria-hidden="true"/><input type="search" value={search} onChange={event => setSearchAndOpen(event.target.value)} placeholder="Company, brand, product or status"/>{search && <button type="button" aria-label="Clear hierarchy search" onClick={() => setSearchAndOpen("")}><X size={17}/></button>}</span></label>
      <label>Status<select value={status} onChange={event => setStatusAndOpen(event.target.value)}><option value="">All statuses</option>{statuses.map(value => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label>
    </div>
    <p className="boss-hierarchy-feedback" role="status" aria-live="polite">{shown ? `${shown} visible ${shown === 1 ? "node" : "nodes"} in the current view.` : filtered?.children.length && !expanded.has(root.id) ? "Group collapsed. Expand it to view companies." : search || status ? "No matching authorized records. Clear the search or status filter to see the selected company." : "No authorized company records are available."}</p>
    {!brandReadable || !productReadable ? <p className="muted">Some brand or product records are unavailable under your current permissions.</p> : null}
    {filtered && (filtered.children.length || (!search && !status)) ? <ul className="boss-hierarchy-root"><HierarchyBranch node={filtered} expanded={expanded} onToggle={id => setExpanded(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; })}/></ul> : <div className="boss-hierarchy-empty"><p>{search || status ? "No matching company, brand or product in this authorized scope." : "No company records are configured in this authorized scope."}</p></div>}
    {!root.children.length && !search && !status && <p className="boss-hierarchy-empty">No company records are configured in this authorized scope.</p>}
    {selectedCompanyId && !search && !status && companyRoot.children[0]?.children.length === 0 && <p className="boss-hierarchy-empty">No authorized brands, business units or products are configured for this company.</p>}
  </section>;
}
