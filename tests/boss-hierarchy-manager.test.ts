import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { ModuleKind, JsxEmit, transpileModule } from "typescript";
import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { HierarchyManagement } from "@/app/app/boss/hierarchy-manager";
import type { HierarchyNode } from "@/server/group/boss-hierarchy";

const require = createRequire(import.meta.url);
const code = transpileModule(readFileSync("src/app/app/boss/hierarchy-manager.tsx", "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
const target = { exports: {} };
const Icon = () => createElement("span", null);
runInNewContext(code, { module: target, exports: target.exports, require: (name: string) => ({
  "next/link": { __esModule: true, default: ({ href, children }: { href: string; children: ReactNode }) => createElement("a", { href }, children) },
  "next/navigation": { useRouter: () => ({ refresh: () => undefined }) },
  "lucide-react": { Building2: Icon, Layers3: Icon, Plus: Icon, Pencil: Icon, Trash2: Icon, X: Icon, ArrowUpRight: Icon },
  "./hierarchy-actions": { saveBossHierarchyRecord: async () => ({}) },
  "./registry-actions": { removeBossRegistryRecord: async () => ({}) }
} as Record<string, unknown>)[name] ?? require(name) });
const HierarchyManager = (target.exports as { HierarchyManager: ComponentType<{ node: HierarchyNode; management: HierarchyManagement; onClose: () => void; onSelect: (node: HierarchyNode) => void }> }).HierarchyManager;
const management: HierarchyManagement = { companyCreate: true, companyIds: ["aira"], brandCompanyIds: ["aira"] };
const render = (node: HierarchyNode, grants = management) => renderToStaticMarkup(createElement(HierarchyManager, { node, management: grants, onClose: () => undefined, onSelect: () => undefined }));
const brand: HierarchyNode = { id: "brand:labs", recordId: "labs", organizationId: "aira", kind: "BRAND", name: "AIRA Labs", status: "ACTIVE", href: "/app/boss/brands/labs", children: [] };
const company: HierarchyNode = { id: "aira", recordId: "profile-aira", kind: "COMPANY", name: "AIRA Skill City", status: "ACTIVE", href: "/app/boss/companies/aira", children: [brand] };
const group: HierarchyNode = { id: "group", kind: "GROUP", name: "MAXPASE Group", status: "ACTIVE", href: "/app/boss?view=companies", children: [company] };

describe("Boss hierarchy management dialog", () => {
  it("opens a labelled Group control with Add company and company selection", () => {
    const html = render(group);
    expect(html).toContain('<dialog');
    expect(html).toContain('aria-labelledby="hierarchy-dialog-title"');
    expect(html).toContain("Add company");
    expect(html).toContain("AIRA Skill City");
  });
  it("shows company brand controls and brand sub-brand controls with scoped management", () => {
    const companyHtml = render(company);
    expect(companyHtml).toContain("Add brand");
    expect(companyHtml).toContain("Archive / remove");
    expect(companyHtml).toContain("AIRA Labs");
    const brandHtml = render(brand);
    expect(brandHtml).toContain("Add sub-brand");
    expect(brandHtml).toContain("Archive / delete");
    expect(brandHtml).toContain('href="/app/boss/brands/labs"');
  });
  it("does not present mutations without the relevant permission", () => {
    const html = render(company, { companyCreate: false, companyIds: [], brandCompanyIds: [] });
    expect(html).not.toContain("Add brand");
    expect(html).not.toContain("Archive / remove");
    expect(html).toContain("Management actions are unavailable");
  });
});
