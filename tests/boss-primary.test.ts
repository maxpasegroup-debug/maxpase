import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { transpileModule, ModuleKind, JsxEmit } from "typescript";
import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
function load<T>(path: string, mocks: Record<string, unknown>): T {
  const code = transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const target = { exports: {} };
  runInNewContext(code, { module: target, exports: target.exports, require: (name: string) => name in mocks ? mocks[name] : require(name) });
  return target.exports as T;
}

const Link = ({ href, children }: { href: string; children: ReactNode }) => createElement("a", { href }, children);
const Icon = () => createElement("span", null);
const structure = [{
  organizationId: "aira", slug: "aira-skill-city", legalName: "AIRA SKILL CITY PRIVATE LIMITED", recordedLegalName: "AIRA SKILL CITY PRIVATE LIMITED", displayName: "AIRA", status: "ACTIVE", health: "NO_RECORDED_WORK", evidence: { coverage: "Authorized records only" },
  divisions: [{ slug: "aira-labs", label: "AIRA Labs", product: "BGOS", productSlug: "bgos", row: { status: "ACTIVE" }, productRow: undefined }],
  products: [], brands: [{ name: "HappiNotes", row: undefined }]
}, {
  organizationId: "tearn", slug: "pearn", legalName: "TEARN PRIVATE LIMITED", recordedLegalName: "PEARN PRIVATE LIMITED", displayName: "PEARN", status: "ACTIVE", health: "NO_RECORDED_WORK", evidence: { coverage: "Authorized records only" }, divisions: [], products: [{ name: "TeachX Guru", row: { lifecycle: "CONCEPT" } }], brands: []
}];
const { BossPrimary } = load<{ BossPrimary: ComponentType<{ view: string; data: unknown; query: object }> }>("src/app/app/boss/primary.tsx", {
  "next/link": { __esModule: true, default: Link },
  "lucide-react": { ArrowUpRight: Icon, Bot: Icon, Building2: Icon, ShieldCheck: Icon },
  "@/components/ui/status": { Status: ({ value }: { value: string }) => createElement("span", null, value) },
  "@/components/ui/user-time": { UserTime: () => createElement("span", null, "Not recorded") },
  "@/server/group/boss-reliability": { bossHref: (view: string, companyId?: string) => `/app/boss?view=${view}${companyId ? `&companyId=${companyId}` : ""}` },
  "@/server/group/boss-overview": { overviewHref: () => "/app/boss?view=overview", overviewKey: () => "item" },
  "@/server/group/boss-structure": { projectBossStructure: () => structure },
  "@/server/group/product-drafts": { seniorAcademicAdvisorDraft: { title: "Senior Academic Advisor", engagement: "IN_HOUSE_EMPLOYEE", monthlySalaryMinor: 1800000, scope: ["BGOS", "PBA", "GenZ Builder"] } },
  "@/lib/workspace-navigation": { workspaceHref: (href: string) => href, bossViews: { brands: "Brands & Domains" } },
  "./overview": { OverviewRows: () => createElement("p", null, "No matching records") }
});

const data = { selectedCompanyId: undefined, readable: { organization: true, product: true, brand: true }, cards: [], shortcuts: [], system: { backup: "NOT VERIFIED", monitoring: "NOT VERIFIED", production: "NOT VERIFIED" } };
describe("Boss primary surface", () => {
  it("shows the owner-approved hierarchy with missing products and brands qualified", () => {
    const html = renderToStaticMarkup(createElement(BossPrimary, { view: "companies", data, query: {} }));
    expect(html).toContain("MAXPASE GROUP");
    expect(html).toContain("TEARN PRIVATE LIMITED");
    expect(html).toContain("Recorded legal name: PEARN PRIVATE LIMITED");
    expect(html).toContain("BGOS");
    expect(html).toContain("HappiNotes");
    expect(html).toContain("Not configured");
    expect(html).toContain("Recorded / CONCEPT");
    expect(html).toContain("INR 18,000 per month");
    expect(html).toContain("/app/boss/command/aira-skill-city/aira-labs");
    expect(html).toContain("/app/boss/command/aira-skill-city/aira-skill-city");
    expect(html).toContain("/app/boss/command/pearn/teachx-guru");
  });
  it("keeps agent authority limited in the Boss settings surface", () => {
    const html = renderToStaticMarkup(createElement(BossPrimary, { view: "settings", data, query: {} }));
    expect(html).toContain("NEXA has no agent role grants or execution authority");
    expect(html).not.toContain("<form");
  });
});
