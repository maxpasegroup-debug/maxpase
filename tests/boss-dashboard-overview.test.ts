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
  "lucide-react": { ArrowRight: Icon, Bot: Icon, BriefcaseBusiness: Icon, Building2: Icon, ClipboardCheck: Icon, FolderKanban: Icon, Users: Icon },
  "@/components/ui/status": { Status: ({ value }: { value: string }) => createElement("span", null, value) },
  "@/components/ui/user-time": { UserTime: () => createElement("span", null, "Not recorded") },
  "@/server/group/boss-reliability": { bossHref: (view: string) => `/app/boss?view=${view}` },
  "@/server/group/boss-overview": { overviewHref: () => "/app/boss?view=overview&queue=decisions", overviewKey: (row: { id: string }) => row.id },
};
runInNewContext(code, { module: target, exports: target.exports, require: (name: string) => name in mocks ? mocks[name] : require(name) });
const { BossDashboardOverview } = target.exports as { BossDashboardOverview: ComponentType<{ data: unknown; query: object }> };

function render(overrides: Record<string, unknown> = {}) {
  const data = {
    selectedCompanyId: undefined, companies: [{ organizationId: "company" }],
    cards: [{ organizationId: "company", legalName: "AIRA SKILL CITY PRIVATE LIMITED", displayName: "AIRA", status: "ACTIVE", health: "NO_RECORDED_WORK", divisions: [], projects: [], }],
    members: [], headline: { activeProjects: 0, activePeople: 0 }, oversight: { openBlockers: 0, overdueTasks: 0, pendingRecordedDecisions: 0 },
    overview: { queues: { decisions: [], approvals: [] }, coverage: { decisions: true, approvals: true }, urgent: [], canAct: () => false, nextAction: () => "Review" },
    snapshot: { options: { organizations: [] } }, nexa: { initialized: false, directiveCount: 0 }, ...overrides,
  };
  return renderToStaticMarkup(createElement(BossDashboardOverview, { data, query: {} }));
}

describe("Boss dashboard overview", () => {
  it("shows actual zeroes, qualified preview labels, and no invented progress or NEXA analysis", () => {
    const html = render();
    expect(html).toContain("AIRA SKILL CITY PRIVATE LIMITED");
    expect(html).toContain("0</strong>");
    expect(html).toContain("projects in preview");
    expect(html).toContain("No urgent items in the current authorized preview");
    expect(html).toContain("NEXA is not initialized");
    expect(html).not.toContain("78%");
  });
  it("keeps restricted metrics unavailable and links an authorized decision", () => {
    const row = { id: "decision", title: "Review assignment", organizationId: "company", priority: "HIGH", dueAt: null };
    const html = render({ headline: { activeProjects: null, activePeople: null }, overview: { queues: { decisions: [row], approvals: [] }, coverage: { decisions: true, approvals: true }, urgent: [{ queue: "decisions", row }], canAct: () => true, nextAction: () => "Record the decision" } });
    expect(html).toContain("Unavailable");
    expect(html).toContain("Review assignment");
    expect(html).toContain("/app/boss?view=overview&amp;queue=decisions");
    expect(html).toContain("Decisions needed");
  });
});
