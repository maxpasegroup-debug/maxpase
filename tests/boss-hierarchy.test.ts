import { describe, expect, it } from "vitest";
import { buildBossHierarchy, filterBossHierarchy, selectCompanyHierarchy, visibleHierarchyIds, type HierarchySource } from "@/server/group/boss-hierarchy";
import { bossStructure } from "@/server/group/boss-structure";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { transpileModule, ModuleKind, JsxEmit } from "typescript";
import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const code = transpileModule(readFileSync("src/app/app/boss/hierarchy.tsx", "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
const target = { exports: {} };
const Icon = () => createElement("span", null);
runInNewContext(code, { module: target, exports: target.exports, require: (name: string) => ({
  "next/link": { __esModule: true, default: ({ href, children }: { href: string; children: ReactNode }) => createElement("a", { href }, children) },
  "next/navigation": { useRouter: () => ({ push: () => undefined }) },
  "lucide-react": { Boxes: Icon, Building2: Icon, ChevronDown: Icon, ChevronRight: Icon, Layers3: Icon, List: Icon, Search: Icon, Shield: Icon, X: Icon },
  "@/components/ui/status": { Status: ({ value }: { value: string }) => createElement("span", null, value) },
  "@/server/group/boss-hierarchy": { filterBossHierarchy, selectCompanyHierarchy, visibleHierarchyIds }
} as Record<string, unknown>)[name] ?? require(name) });
const BossHierarchy = (target.exports as { BossHierarchy: ComponentType<{ root: ReturnType<typeof buildBossHierarchy>; selectedCompanyId?: string; initialSearch?: string; initialStatus?: string; brandReadable: boolean; productReadable: boolean }> }).BossHierarchy;

const source: HierarchySource = {
  groupId: "group",
  organizations: [
    { id: "group", parentId: null, name: "MAXPASE Group", type: "GROUP", status: "ACTIVE" },
    { id: "aira", parentId: "group", name: "AIRA", type: "COMPANY", status: "ACTIVE" },
    { id: "tearn", parentId: "group", name: "TEARN", type: "COMPANY", status: "ACTIVE" },
    { id: "labs", parentId: "aira", name: "AIRA Labs", type: "DIVISION", status: "ACTIVE" },
    { id: "hidden-unit", parentId: "foreign", name: "Outside scope", type: "DIVISION", status: "ACTIVE" }
  ],
  companies: [
    { id: "company-aira", organizationId: "aira", legalName: "AIRA Skill City Private Limited", displayName: "AIRA", status: "ACTIVE" },
    { organizationId: "tearn", legalName: "TEARN Private Limited", displayName: "TEARN", status: "INACTIVE" },
    { organizationId: "foreign", legalName: "Unlisted Company", displayName: "Unlisted", status: "ACTIVE" }
  ],
  brands: [
    { id: "brand-labs", organizationId: "aira", name: "AIRA Labs Brand", status: "ACTIVE" },
    { id: "brand-hidden", organizationId: "foreign", name: "Hidden brand", status: "ACTIVE" }
  ],
  products: [
    { id: "bgos", organizationId: "aira", divisionId: "labs", brandId: "brand-labs", name: "BGOS", type: "PLATFORM", lifecycle: "CONCEPT", status: "INACTIVE" },
    { id: "service", organizationId: "aira", divisionId: "labs", brandId: null, name: "Automation review", type: "SERVICE", lifecycle: "ACTIVE", status: "ACTIVE" },
    { id: "hidden-product", organizationId: "foreign", name: "Hidden product", type: "PRODUCT", lifecycle: "ACTIVE", status: "ACTIVE" }
  ]
};

describe("Boss registry hierarchy", () => {
  it("keeps the owner-confirmed company, brand and sub-brand map", () => {
    expect(bossStructure.map(company => company.legalName)).toEqual(["AIRA SKILL CITY PRIVATE LIMITED", "TEARN PRIVATE LIMITED", "TOP RANK AI PRIVATE LIMITED"]);
    expect(bossStructure[0].brands.map(brand => brand.name)).toEqual(["AIRA SKILL CITY", "AIRA STARTUP SKOOL", "AIRA LABS", "AIRA CAREER HUB"]);
    expect(bossStructure[0].subBrands.filter(brand => brand.parentSlug === "aira-labs").map(brand => brand.name)).toEqual(["MY SOLAR SOLUTIONS", "NTE NAADU", "HAPPINOTES", "TALKIN LABS", "BGOS"]);
    expect(bossStructure[0].subBrands.filter(brand => brand.parentSlug === "aira-career-hub").map(brand => brand.name)).toEqual(["NICEJOBS"]);
    expect(bossStructure[1].brands.map(brand => brand.name)).toEqual(["TEACHX GURU", "LEARNX GURU"]);
    expect(bossStructure[2].brands.map(brand => brand.name)).toEqual(["TOP TANK AI"]);
  });
  it("uses verified parent IDs and excludes records outside authorized companies", () => {
    const root = buildBossHierarchy(source);
    expect(root.children.map(node => node.id)).toEqual(["aira", "tearn"]);
    const aira = root.children[0];
    expect(aira.children.map(node => node.id)).toEqual(["labs", "brand:brand-labs"]);
    expect(aira.children[1].children.map(node => node.id)).toEqual(["product:bgos"]);
    expect(aira.children[0].children.map(node => node.id)).toEqual(["product:service"]);
    expect(aira.children[1].children[0]).toMatchObject({ status: "INACTIVE", lifecycle: "CONCEPT", href: "/app/business/products?recordId=bgos" });
    expect(JSON.stringify(root)).not.toContain("Hidden");
  });

  it("nests sub-brands by recorded parent ID and rejects foreign or cyclic parents", () => {
    const nested: HierarchySource = { ...source, brands: [
      ...source.brands,
      { id: "solar", organizationId: "aira", parentBrandId: "brand-labs", name: "MY SOLAR SOLUTIONS", status: "INACTIVE" },
      { id: "foreign-child", organizationId: "tearn", parentBrandId: "brand-labs", name: "Foreign child", status: "ACTIVE" },
      { id: "cycle-a", organizationId: "aira", parentBrandId: "cycle-b", name: "Cycle A", status: "ACTIVE" },
      { id: "cycle-b", organizationId: "aira", parentBrandId: "cycle-a", name: "Cycle B", status: "ACTIVE" }
    ] };
    const tree = buildBossHierarchy(nested);
    const labs = tree.children[0].children.find(node => node.id === "brand:brand-labs");
    expect(labs?.children.some(node => node.id === "brand:solar" && node.href === "/app/boss/brands/solar")).toBe(true);
    expect(JSON.stringify(tree)).not.toContain("Foreign child");
    expect(JSON.stringify(tree)).not.toContain("Cycle A");
    expect(JSON.stringify(filterBossHierarchy(tree, "solar", ""))).toContain("MY SOLAR SOLUTIONS");
  });

  it("isolates the selected company without changing the registry source", () => {
    const root = buildBossHierarchy(source);
    const selected = selectCompanyHierarchy(root, "tearn");
    expect(selected.children.map(node => node.id)).toEqual(["tearn"]);
    expect(root.children).toHaveLength(2);
    expect(selected.children[0].children).toEqual([]);
    expect(selectCompanyHierarchy(root).children).toHaveLength(2);
  });

  it("opens only requested descendants and supports collapse", () => {
    const root = buildBossHierarchy(source);
    expect(visibleHierarchyIds(root, new Set(["group"]))).toEqual(["group", "aira", "tearn"]);
    expect(visibleHierarchyIds(root, new Set(["group", "aira", "brand:brand-labs"]))).toContain("product:bgos");
    expect(visibleHierarchyIds(root, new Set(["group", "aira"]))).not.toContain("product:bgos");
  });

  it("shows a product's verified parent path when searched, then restores the company on clear", () => {
    const selected = selectCompanyHierarchy(buildBossHierarchy(source), "aira");
    const result = filterBossHierarchy(selected, "bgos", "");
    expect(result?.children.map(node => node.id)).toEqual(["aira"]);
    expect(result?.children[0].children.map(node => node.id)).toEqual(["brand:brand-labs"]);
    expect(result?.children[0].children[0].children.map(node => node.id)).toEqual(["product:bgos"]);
    expect(filterBossHierarchy(selected, "", "")?.children).toHaveLength(1);
    expect(filterBossHierarchy(selected, "missing", "")).toBeNull();
  });

  it("searches status and filters concept independently of inactive status", () => {
    const root = buildBossHierarchy(source);
    expect(JSON.stringify(filterBossHierarchy(root, "concept", ""))).toContain("BGOS");
    expect(JSON.stringify(filterBossHierarchy(root, "", "CONCEPT"))).toContain("BGOS");
    expect(JSON.stringify(filterBossHierarchy(root, "", "CONCEPT"))).not.toContain("Automation review");
  });

  it("opens company and brand workspaces while preserving verified parent relationships", () => {
    const root = buildBossHierarchy(source);
    expect(root.children[0].href).toBe("/app/boss/companies/aira");
    expect(root.children[0].children[0].href).toBe("/app/business/organizations?recordId=labs");
    expect(root.children[0].children[1].href).toBe("/app/boss/brands/brand-labs");
    expect(root.children[1].children).toEqual([]);
    expect(buildBossHierarchy({ ...source, organizations: [], companies: [], brands: [], products: [] }).children).toEqual([]);
  });

  it("renders a collapsed company overview with accessible controls and focused search paths", () => {
    const root = buildBossHierarchy(source);
    const overview = renderToStaticMarkup(createElement(BossHierarchy, { root, brandReadable: true, productReadable: true }));
    expect(overview).toContain('aria-label="Expand AIRA Skill City Private Limited"');
    expect(overview).toContain('aria-expanded="false"');
    expect(overview).toContain('boss-hierarchy-company-grid');
    expect(overview).toContain('2 brands / units · 2 products / services');
    expect(overview).toContain('href="/app/business/companies"');
    expect(overview).not.toContain("BGOS");
    expect(overview).toContain("All Companies");
    const searched = renderToStaticMarkup(createElement(BossHierarchy, { root, brandReadable: true, productReadable: true, initialSearch: "BGOS" }));
    expect(searched).toContain("BGOS");
    expect(searched).toContain("AIRA Labs Brand");
    expect(searched).toContain('href="/app/business/products?recordId=bgos"');
    expect(searched).toContain("CONCEPT");
    expect(searched).not.toContain("<strong>TEARN Private Limited</strong>");
  });

  it("shows only the selected company and a clear unconfigured state", () => {
    const root = buildBossHierarchy(source);
    const selected = renderToStaticMarkup(createElement(BossHierarchy, { root, selectedCompanyId: "tearn", brandReadable: true, productReadable: true }));
    expect(selected).toContain("TEARN Private Limited");
    expect(selected).not.toContain("AIRA Skill City Private Limited</strong>");
    expect(selected).toContain("No authorized brands, business units or products are configured");
    const empty = renderToStaticMarkup(createElement(BossHierarchy, { root: buildBossHierarchy({ ...source, organizations: [], companies: [], brands: [], products: [] }), brandReadable: false, productReadable: false }));
    expect(empty).toContain("No company records are configured");
    expect(empty).toContain("current permissions");
  });
});
