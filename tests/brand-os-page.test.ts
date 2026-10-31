import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { transpileModule, ModuleKind, JsxEmit } from "typescript";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { brandOperatingModules } from "@/server/group/brand-os";

const nativeRequire = createRequire(import.meta.url);
const source = readFileSync("src/app/app/boss/brands/[id]/page.tsx", "utf8");
const code = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
class AccessError extends Error {}
function load(read: () => Promise<unknown>) {
  const target = { exports: {} as { default: (props: { params: Promise<{ id: string }> }) => Promise<ReactNode> } };
  const mocks: Record<string, unknown> = {
    "next/link": { __esModule: true, default: ({ href, children }: { href: string; children: ReactNode }) => createElement("a", { href }, children) },
    "next/navigation": { notFound: () => { throw new Error("NOT_FOUND"); } },
    "@/server/auth/guards": { requireSession: async () => ({ userId: "boss" }) },
    "@/server/authorization/engine": { AccessError },
    "@/server/group/boss-registry": { bossRegistry: { brand: read } },
    "@/server/group/brand-os": { brandOperatingModules },
    "@/server/group/brand-reporting": { buildBrandReport: () => [] },
    "../../registry-controls": { RegistryControls: () => createElement("span", null, "Registry controls") }
  };
  runInNewContext(code, { module: target, exports: target.exports, require: (name: string) => mocks[name] ?? nativeRequire(name) });
  return target.exports.default;
}

describe("Boss brand command center", () => {
  it("shows the verified parent path and only accessible operating records", async () => {
    const page = load(async () => ({
      row: { id: "child", name: "Startup School", slug: "startup-school", status: "ACTIVE", website: null, organizationId: "company", organization: { company: { displayName: "AIRA Skill City" } } },
      parent: { id: "parent", name: "Parent Brand" }, children: [], products: null, projects: null,
      startupDivision: "startup-division", programs: [{ id: "pba", name: "PBA", kind: "PROGRAM", status: "DRAFT", durationDays: null, capacity: null }], canManagePrograms: false,
      commandHref: null, permissions: { work: false, approvals: false, people: false, products: false, manage: false }
    }));
    const html = renderToStaticMarkup(await page({ params: Promise.resolve({ id: "child" }) }));
    expect(html).toContain('href="/app/boss/brands/parent"');
    expect(html).toContain('href="#programs"');
    expect(html).toContain("PBA");
    expect(html).toContain("DRAFT");
    expect(html).toContain('href="/app/boss/brands/child/programs"');
    expect(html).not.toContain("Registry controls");
  });

  it("turns a denied brand read into a protected not-found response", async () => {
    const page = load(async () => { throw new AccessError("Access denied"); });
    await expect(page({ params: Promise.resolve({ id: "foreign" }) })).rejects.toThrow("NOT_FOUND");
  });
  it("shows Skill Studio drafts through the existing scoped programme registry", async () => {
    const page = load(async () => ({
      row: { id: "studio-brand", name: "AIRA SKILL STUDIO", slug: "aira-skill-studio", status: "ACTIVE", website: null, organizationId: "company", organization: { company: { displayName: "AIRA Skill City" } } },
      parent: null, children: [], products: [], projects: [], startupDivision: null, studioDivision: "studio-division",
      programs: [{ id: "genz", name: "GenZ Builder", kind: "PROGRAM", status: "DRAFT", durationDays: null, capacity: null }],
      canManagePrograms: true, canReadAdmissions: false, commandHref: null,
      permissions: { work: false, approvals: false, people: false, products: true, manage: false }
    }));
    const html = renderToStaticMarkup(await page({ params: Promise.resolve({ id: "studio-brand" }) }));
    expect(html).toContain('href="/app/aira/programs?organizationId=studio-division"');
    expect(html).toContain("GenZ Builder");
    expect(html).toContain("DRAFT");
    expect(html).not.toContain("Startup School programmes");
  });
});
