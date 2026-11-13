import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { transpileModule, ModuleKind, JsxEmit } from "typescript";
import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const code = transpileModule(readFileSync("src/app/app/boss/dashboard-overview.tsx", "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
const target = { exports: {} };
const Link = ({ href, children, ...props }: { href: string; children: ReactNode }) => createElement("a", { href, ...props }, children);
const Icon = () => createElement("span", null);
const mocks: Record<string, unknown> = {
  "next/link": { __esModule: true, default: Link },
  "lucide-react": { ArrowRight: Icon, BriefcaseBusiness: Icon, Building2: Icon, Users: Icon, Wallet: Icon },
  "@/components/ui/status": { Status: ({ value }: { value: string }) => createElement("span", null, value) },
  "@/components/ui/user-time": { UserTime: () => createElement("span", null, "Not recorded") },
  "@/server/group/boss-reliability": { bossHref: (view: string) => `/app/boss?view=${view}` },
  "@/server/group/boss-overview": { overviewHref: () => "/app/boss?view=overview&queue=decisions", overviewKey: (row: { id: string }) => row.id },
  "@/lib/boss-departments": { bossDepartments: { marketing: { label: "Marketing" }, hr: { label: "HR" }, sales: { label: "Sales" }, finance: { label: "Finance" }, operations: { label: "Operations" } }, departmentHref: (key: string) => `/app/boss/departments/${key}` },
};
runInNewContext(code, { module: target, exports: target.exports, require: (name: string) => name in mocks ? mocks[name] : require(name) });
const { BossDashboardOverview } = target.exports as { BossDashboardOverview: ComponentType<{ data: unknown; query: object }> };

function render(overrides: Record<string, unknown> = {}) {
  const data = {
    selectedCompanyId: undefined, companies: [{ organizationId: "company" }], brands: [], readable: { brand: true },
    cards: [{ organizationId: "company", legalName: "AIRA SKILL CITY PRIVATE LIMITED", displayName: "AIRA", status: "ACTIVE", health: "NO_RECORDED_WORK", divisions: [], projects: [], }],
    members: [], headline: { activeProjects: 0, activePeople: 0 }, oversight: { openBlockers: 0, overdueTasks: 0, pendingRecordedDecisions: 0 },
    overview: { queues: { decisions: [], approvals: [] }, coverage: { decisions: true, approvals: true }, urgent: [], canAct: () => false, nextAction: () => "Review" },
    snapshot: { options: { organizations: [] } }, nexa: { initialized: false, directiveCount: 0 }, ...overrides,
  };
  return renderToStaticMarkup(createElement(BossDashboardOverview, { data, query: {} }));
}

describe("Boss dashboard overview", () => {
  it("shows a simple group home with honest counts and no invented progress", () => {
    const html = render();
    expect(html).toContain("Your group at a glance");
    expect(html).toContain("Companies");
    expect(html).toContain("Priority items");
    expect(html).toContain("Nothing urgent was found");
    expect(html).toContain("Open a workspace");
    expect(html).toContain("AIRA SKILL CITY PRIVATE LIMITED");
    expect(html).not.toContain("78%");
  });
  it("keeps restricted metrics unavailable and links an authorized decision", () => {
    const row = { id: "decision", title: "Review assignment", organizationId: "company", priority: "HIGH", dueAt: null };
    const html = render({ readable: { brand: false }, overview: { queues: { decisions: [row], approvals: [] }, coverage: { decisions: true, approvals: true }, urgent: [{ queue: "decisions", row }], canAct: () => true, nextAction: () => "Record the decision" } });
    expect(html).toContain("Not available");
    expect(html).toContain("Review assignment");
    expect(html).toContain("/app/boss?view=overview&amp;queue=decisions");
    expect(html).toContain("Priority items");
  });
});
