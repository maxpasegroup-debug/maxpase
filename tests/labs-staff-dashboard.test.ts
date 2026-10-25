import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { transpileModule, ModuleKind, JsxEmit } from "typescript";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const source = transpileModule(readFileSync("src/app/sites/labs-ui/workspace.tsx", "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
const target = { exports: {} };
const Icon = () => createElement("span", null);
const Link = ({ href, children }: { href: string; children: ReactNode }) => createElement("a", { href }, children);
const data = { records: [], projects: [], quotes: [], total: 0, metrics: { new: 0, overdue: 0, qualified: 0, won: 0 }, filter: { search: "", status: null, due: null, page: 1 }, capabilities: { manage: true, perform: true, quote: false, issue: false, delivery: false }, config: { intake: false, billing: false, quotePolicy: false } };
const mocks: Record<string, unknown> = {
  "next/link": { __esModule: true, default: Link },
  "lucide-react": Object.fromEntries(["ArrowLeft", "LayoutDashboard", "Handshake", "FolderKanban", "Users", "Receipt", "Settings", "LogOut"].map(name => [name, Icon])),
  "@/server/labs/service": { labsService: { list: async () => data, people: async () => [], unassigned: async () => [], projectList: async () => [] } },
  "@/server/portals/policy": { requirePortalAccess: async () => ({ divisionId: "labs", ctx: { decide: async () => ({ allowed: false }) } }) },
  "@/server/db": { prisma: {} },
  "@/server/authorization/engine": { AccessError: class extends Error {} },
  "@/server/labs/input": { leadStates: ["NEW", "CONTACTED"] },
  "../[site]/actions": { portalLogoutAction: async () => {} },
  "./form": { LabsForm: () => null, LocalInstant: () => null },
  "./project-work": { ProjectWork: () => null },
  "./reminders": { LabsReminders: () => null },
  "./customer-grants": { CustomerGrants: () => null },
};
runInNewContext(source, { module: target, exports: target.exports, require: (name: string) => name in mocks ? mocks[name] : require(name) });
const { LabsWorkspace } = target.exports as { LabsWorkspace: (props: { userId: string; email: string; base: string; home: string; query: object; businessDevelopmentManager?: boolean }) => Promise<ReactNode> };

describe("AIRA Labs staff workspace", () => {
  it("gives the Business Development Manager a focused, honest sales desk", async () => {
    const html = renderToStaticMarkup(await LabsWorkspace({ userId: "manager", email: "manager@test.invalid", base: "/sites/labs/gateway", home: "/sites/labs", query: {}, businessDevelopmentManager: true }));
    expect(html).toContain("My sales desk");
    expect(html).toContain("BUSINESS DEVELOPMENT MANAGER");
    expect(html).toContain("Review today");
    expect(html).toContain("Website enquiry intake is not configured");
    expect(html).toContain("?view=people");
    expect(html).not.toContain("?view=finance");
    expect(html).not.toContain("?view=projects");
    expect(html).not.toContain("?view=settings");
    expect(html).not.toContain("No quotation drafts");
  });
});
