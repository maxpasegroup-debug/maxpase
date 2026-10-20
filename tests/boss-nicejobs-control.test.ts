import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { transpileModule, ModuleKind, JsxEmit } from "typescript";
import { describe, expect, it, vi } from "vitest";

const nativeRequire = createRequire(import.meta.url);
const Link = ({ href, children }: { href: string; children: ReactNode }) => createElement("a", { href }, children);
class AccessError extends Error {}

function load<T>(path: string, mocks: Record<string, unknown>): T {
  const code = transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const target = { exports: {} };
  runInNewContext(code, { module: target, exports: target.exports, require: (name: string) => name in mocks ? mocks[name] : nativeRequire(name) });
  return target.exports as T;
}

describe("Nice Jobs control inside MAXPASE Boss", () => {
  it("requires the authenticated Boss authority before rendering Nice Jobs controls", async () => {
    const authority = vi.fn(async (userId: string) => { if (userId !== "verified-boss") throw new AccessError("Denied"); });
    const workspace = vi.fn(({ base, query }: { base: string; query: { view: string } }) => createElement("p", null, `${base} / ${query.view}`));
    let userId = "verified-boss";
    const { default: page } = load<{ default: (props: { searchParams: Promise<Record<string, string>> }) => Promise<ReactNode> }>("src/app/app/boss/nicejobs/page.tsx", {
      "next/link": Link,
      "next/navigation": { notFound: () => { throw new Error("Not found"); } },
      "@/server/auth/guards": { requireSession: async () => ({ userId }) },
      "@/server/authorization/engine": { AccessError },
      "@/server/group/boss-service": { bossService: { authority } },
      "@/app/app/nicejobs/boss-workspace": { BossWorkspace: workspace }
    });
    const html = renderToStaticMarkup(await page({ searchParams: Promise.resolve({ view: "applications", userId: "forged" }) }));
    expect(html).toContain("/app/boss/nicejobs / applications");
    expect(html).toContain("AIRA Career Hub");
    expect(authority).toHaveBeenCalledWith("verified-boss");
    expect(workspace).toHaveBeenCalledWith(expect.objectContaining({ userId: "verified-boss", realm: "corporate", base: "/app/boss/nicejobs" }), undefined);
    userId = "director-only";
    await expect(page({ searchParams: Promise.resolve({ view: "workforce-command" }) })).rejects.toThrow("Not found");
    expect(workspace).toHaveBeenCalledTimes(1);
  });

  it("links the Career Hub only when Nice Jobs management is authorized", async () => {
    const navigation = vi.fn(async () => ({ groups: [{ key: "overview", entries: [{ view: "workforce-command" }] }] }));
    const data = { companyId: "aira-company", companyName: "AIRA Skill City", companyStatus: "ACTIVE", scopeId: "career-division", label: "AIRA Career Hub", division: { status: "ACTIVE" }, brand: null, product: null, canReadDecisions: false, canReadWork: false, canReadPeople: false, canManagePeople: false };
    const read = vi.fn(async (_userId: string, _company: string, unit: string) => ({ ...data, label: unit }));
    const { default: page } = load<{ default: (props: { params: Promise<{ company: string; unit: string }> }) => Promise<ReactNode> }>("src/app/app/boss/command/[company]/[unit]/page.tsx", {
      "next/link": Link,
      "next/navigation": { notFound: () => { throw new Error("Not found"); } },
      "@/server/auth/guards": { requireSession: async () => ({ userId: "verified-boss" }) },
      "@/server/authorization/engine": { AccessError },
      "@/server/group/brand-command": { brandCommandService: { read } },
      "@/lib/workspace-navigation": { workspaceHref: (path: string) => path },
      "@/server/skillcity/staff-onboarding": { staffOnboardingService: { options: vi.fn() } },
      "@/components/staff-draft-form": { StaffDraftForm: () => null },
      "../../staff-actions": { bossStaffDraftAction: vi.fn(), bossStaffInviteAction: vi.fn() },
      "../../role-template-form": { RoleTemplateForm: () => null },
      "@/server/skillcity/staff-invite": { staffInvite: { drafts: vi.fn() } },
      "@/components/staff-invite-panel": { StaffInvitePanel: () => null },
      "@/server/nicejobs/control-panel": { niceJobsControlPanel: { navigation } }
    });
    const career = { company: "aira-skill-city", unit: "aira-career-hub" };
    const html = renderToStaticMarkup(await page({ params: Promise.resolve(career) }));
    expect(html).toContain("Nice Jobs control panel");
    expect(html).toContain("/app/boss/nicejobs?view=workforce-command&amp;companyId=aira-company");
    expect(navigation).toHaveBeenCalledWith("verified-boss", { companyId: "aira-company" });
    const labs = renderToStaticMarkup(await page({ params: Promise.resolve({ company: "aira-skill-city", unit: "aira-labs" }) }));
    expect(labs).not.toContain("Nice Jobs control panel");
    expect(navigation).toHaveBeenCalledTimes(1);
    navigation.mockRejectedValueOnce(new AccessError("Denied"));
    const denied = renderToStaticMarkup(await page({ params: Promise.resolve(career) }));
    expect(denied).not.toContain("/app/boss/nicejobs?");
    expect(denied).toContain("administration is not authorized");
  });
});
