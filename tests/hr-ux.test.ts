import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { transpileModule, JsxEmit, ModuleKind } from "typescript";
import type { ReactNode, ComponentType } from "react";

const require = createRequire(import.meta.url);
const Link = ({ href, children, ...props }: { href: string; children: ReactNode }) => createElement("a", { href, ...props }, children);
function load(path: string, mocks: Record<string, unknown>) {
  const code = transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const target = { exports: {} };
  runInNewContext(code, { module: target, exports: target.exports, require: (name: string) => name in mocks ? mocks[name] : require(name) });
  return target.exports as Record<string, ComponentType<Record<string, unknown>>>;
}
const { CentralHrWorkspace } = load("src/app/app/boss/departments/[department]/central-hr.tsx", { "next/link": { __esModule: true, default: Link }, "@/lib/boss-departments": { departmentHref: (_: string, id?: string) => `/app/boss/departments/hr${id ? `?companyId=${id}` : ""}` } });
const { HrEmployees } = load("src/app/app/boss/departments/[department]/hr-employees.tsx", { "next/link": { __esModule: true, default: Link }, "./hr-actions": { hrAction: () => ({}) } });

const company = { organizationId: "company-a", legalName: "AIRA Skill City Private Limited", displayName: "AIRA Skill City" };

describe("HR people journey", () => {
  it("opens the directory with one company switcher and only working primary destinations", () => {
    const html = renderToStaticMarkup(createElement(CentralHrWorkspace, { companies: [company], brands: [{ id: "labs", name: "AIRA Labs", organizationId: company.organizationId, status: "ACTIVE" }], company, employeePanel: createElement("p", null, "Directory records"), departments: [], draftCount: 2, canAddEmployee: true }));
    expect(html).toContain("Directory records");
    expect(html).toContain("2</strong> draft employee records need review");
    expect(html).toContain("+ Add employee");
    expect(html.match(/<select id="hr-company"/g)).toHaveLength(1);
    expect(html).not.toContain("boss-hr-navigation");
    expect(html).not.toContain("Payroll</a>");
  });

  it("shows one person across two brand employments and keeps draft access separate", () => {
    const row = { id: "employment-a", companyId: "company-a", status: "DRAFT", designation: "Developer", employmentType: null, startDate: null, company: { name: "AIRA Skill City", slug: "aira-skill-city" }, person: { id: "person-1", displayName: "Example Person", email: "person@example.invalid", users: [] }, assignments: [{ id: "assignment-a", brandId: "labs", designation: "Developer", status: "DRAFT", startDate: new Date("2026-11-01"), endDate: null, brand: { name: "AIRA Labs" }, department: null, manager: null }] };
    const html = renderToStaticMarkup(createElement(HrEmployees, { employees: [row, { ...row, id: "employment-b", companyId: "company-b", company: { name: "Another company", slug: "other" }, assignments: [] }], brands: [], departments: [], people: [], view: "directory" }));
    expect(html.match(/<tr\b/g)).toHaveLength(2);
    expect(html).toContain("AIRA Labs");
    expect(html).toContain("No account");
    expect(html).toContain("DRAFT");
  });
});
