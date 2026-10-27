export type HierarchyNode = {
  id: string;
  kind: "GROUP" | "COMPANY" | "UNIT" | "BRAND" | "PRODUCT" | "SERVICE";
  name: string;
  status: string;
  lifecycle?: string;
  detail?: string;
  href: string;
  children: HierarchyNode[];
};

type Organization = { id: string; parentId: string | null; name: string; slug?: string; type: string; status?: string };
type Company = { id?: string; organizationId: string; legalName?: string | null; displayName: string; status: string };
type Brand = { id: string; organizationId: string; name: string; status: string; website?: string | null };
type Product = { id: string; organizationId: string; divisionId?: string | null; brandId?: string | null; name: string; type: string; lifecycle: string; status: string };
export type HierarchySource = { groupId: string; organizations: Organization[]; companies: Company[]; brands: Brand[]; products: Product[] };

const detailHref = (kind: string, id: string) => `/app/business/${kind}?recordId=${encodeURIComponent(id)}`;
const sort = (a: HierarchyNode, b: HierarchyNode) => a.name.localeCompare(b.name);

export function buildBossHierarchy(source: HierarchySource): HierarchyNode {
  const group = source.organizations.find(row => row.id === source.groupId);
  const root: HierarchyNode = { id: source.groupId, kind: "GROUP", name: group?.name ?? "MAXPASE Group", status: group?.status ?? "NOT CONFIGURED", href: "/app/boss?view=companies", children: [] };
  const nodes = new Map<string, HierarchyNode>([[root.id, root]]);
  const organizations = new Map(source.organizations.map(row => [row.id, row]));
  for (const company of source.companies) {
    if (organizations.get(company.organizationId)?.parentId !== source.groupId) continue;
    const node: HierarchyNode = { id: company.organizationId, kind: "COMPANY", name: company.legalName || company.displayName, status: company.status, detail: company.displayName !== company.legalName ? company.displayName : undefined, href: company.id ? detailHref("companies", company.id) : `/app/boss?view=companies&companyId=${encodeURIComponent(company.organizationId)}`, children: [] };
    root.children.push(node); nodes.set(node.id, node);
  }
  const units = source.organizations.filter(row => row.type === "DIVISION" || row.type === "BUSINESS_UNIT");
  // Resolve only the authorized organization chain; never attach a unit by name.
  let pending = units;
  while (pending.length) {
    const unresolved: Organization[] = [];
    let attached = 0;
    for (const row of pending) {
      const parent = row.parentId && nodes.get(row.parentId);
      if (!parent || !["COMPANY", "UNIT"].includes(parent.kind)) { unresolved.push(row); continue; }
      const node: HierarchyNode = { id: row.id, kind: "UNIT", name: row.name, status: row.status ?? "NOT CONFIGURED", detail: row.type === "DIVISION" ? "Division" : "Business unit", href: detailHref("organizations", row.id), children: [] };
      parent.children.push(node); nodes.set(row.id, node); attached++;
    }
    if (!attached) break;
    pending = unresolved;
  }
  for (const brand of source.brands) {
    const parent = nodes.get(brand.organizationId);
    if (!parent || !["COMPANY", "UNIT"].includes(parent.kind)) continue;
    const node: HierarchyNode = { id: `brand:${brand.id}`, kind: "BRAND", name: brand.name, status: brand.status, detail: brand.website || undefined, href: detailHref("brands", brand.id), children: [] };
    parent.children.push(node); nodes.set(node.id, node);
  }
  for (const product of source.products) {
    const brand = product.brandId ? nodes.get(`brand:${product.brandId}`) : undefined;
    const division = product.divisionId ? nodes.get(product.divisionId) : undefined;
    const organization = nodes.get(product.organizationId);
    const parent = brand?.kind === "BRAND" && source.brands.some(row => row.id === product.brandId && row.organizationId === product.organizationId) ? brand
      : division?.kind === "UNIT" && organizations.get(product.divisionId!)?.parentId === product.organizationId ? division
      : organization;
    if (!parent || !["COMPANY", "UNIT", "BRAND"].includes(parent.kind)) continue;
    const kind = product.type === "SERVICE" || product.type === "PROGRAM" ? "SERVICE" : "PRODUCT";
    const detail = product.divisionId && brand && division ? `Division: ${division.name}` : product.type.replaceAll("_", " ").toLowerCase();
    parent.children.push({ id: `product:${product.id}`, kind, name: product.name, status: product.status, lifecycle: product.lifecycle, detail, href: detailHref("products", product.id), children: [] });
  }
  const order = (node: HierarchyNode) => { node.children.sort(sort); node.children.forEach(order); };
  order(root);
  return root;
}

export function filterBossHierarchy(node: HierarchyNode, search: string, status: string): HierarchyNode | null {
  const term = search.trim().toLocaleLowerCase();
  const matchesSearch = !term || [node.name, node.kind, node.status, node.lifecycle, node.detail].some(value => value?.toLocaleLowerCase().includes(term));
  const matchesStatus = !status || node.status === status || node.lifecycle === status;
  if (!term && !status) return node;
  const children = node.children.map(child => filterBossHierarchy(child, search, status)).filter((child): child is HierarchyNode => child !== null);
  const nameMatch = !!term && node.name.toLocaleLowerCase().includes(term);
  if (matchesSearch && matchesStatus) return { ...node, children: nameMatch && node.kind !== "GROUP" && !status ? node.children : children };
  return children.length ? { ...node, children } : null;
}

export function selectCompanyHierarchy(root: HierarchyNode, companyId?: string): HierarchyNode {
  return { ...root, children: root.children.filter(node => !companyId || node.id === companyId) };
}

export function visibleHierarchyIds(node: HierarchyNode, expanded: ReadonlySet<string>): string[] {
  return [node.id, ...(expanded.has(node.id) ? node.children.flatMap(child => visibleHierarchyIds(child, expanded)) : [])];
}
