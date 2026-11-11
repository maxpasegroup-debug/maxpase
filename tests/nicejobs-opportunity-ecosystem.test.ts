import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { transpileModule, ModuleKind, JsxEmit } from "typescript";
import { describe, expect, it, vi } from "vitest";

const nativeRequire = createRequire(import.meta.url);
const css = new Proxy({}, { get: (_target, key) => typeof key === "string" ? key : undefined });
function load<T>(path: string, mocks: Record<string, unknown>): T {
  const code = transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const target = { exports: {} };
  runInNewContext(code, { module: target, exports: target.exports, require: (name: string) => name in mocks ? mocks[name] : nativeRequire(name) });
  return target.exports as T;
}

describe("Nice Jobs opportunity ecosystem onboarding", () => {
  it("shows the four requested companies, disclosures and Continue action", async () => {
    const readOnboardingProgress = vi.fn(async () => ({ aboutYou: "STUDENT", ecosystemCompletedAt: null }));
    const JobsAuthShell = ({ title, description, children }: { title: string; description: string; children: ReactNode }) => createElement("main", null, createElement("h1", null, title), createElement("p", null, description), children);
    const { default: Page } = load<{ default: (props: { params: Promise<{ site: string }>; searchParams: Promise<Record<string, string>> }) => Promise<ReactNode> }>("src/app/sites/[site]/signup/next/page.tsx", {
      "next/navigation": { notFound: () => { throw new Error("Not found"); }, redirect: (url: string) => { throw new Error(`Redirect ${url}`); } },
      "@/server/portals/request": { requestPortal: async () => ({ site: { id: "jobs" }, paths: { home: "/jobs", login: "/jobs/login", signup: "/jobs/signup", gateway: "/jobs/gateway" } }) },
      "@/server/portals/session": { getPortalSession: async () => ({ userId: "participant-1" }) },
      "@/server/nicejobs/candidate-about-you": { candidateAboutYou: { readOnboardingProgress } },
      "@/server/group/structure": { groupCompanies: [{ slug: "aira-skill-city" }, { slug: "pearn" }, { slug: "top-rank-ai" }] },
      "@/app/sites/jobs-ui/auth-shell": { JobsAuthShell },
      "@/app/app/nicejobs/ecosystem-action": { completeOpportunityEcosystemAction: "#complete" },
      "../opportunity-ecosystem.module.css": css
    });
    const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ site: "jobs" }), searchParams: Promise.resolve({}) }));
    expect(html).toContain("Multiple Companies. Multiple Opportunities. One Platform.");
    expect(html).toContain("NICEJOBS brings together earning opportunities from companies across our business ecosystem.");
    expect(html).toContain("AIRA Skill City Private Limited");
    expect(html).toContain("TEARN Private Limited");
    expect(html).toContain("Top Rank AI Private Limited");
    expect(html).toContain("Nidus Academy");
    expect(html).toContain("AIRA Startup School, AIRA Skill Studio and AIRA Labs");
    expect(html).toContain("TeachX Guru and LearnX Guru");
    expect(html).toContain("defence career and training programmes");
    expect(html).toContain("Income is not guaranteed.");
    expect(html).toContain("Continue");
    expect(readOnboardingProgress).toHaveBeenCalledWith("participant-1");
  });

  it("sends participants without a saved About You selection back to that required step", async () => {
    const { default: Page } = load<{ default: (props: { params: Promise<{ site: string }>; searchParams: Promise<Record<string, string>> }) => Promise<ReactNode> }>("src/app/sites/[site]/signup/next/page.tsx", {
      "next/navigation": { notFound: () => { throw new Error("Not found"); }, redirect: (url: string) => { throw new Error(`Redirect ${url}`); } },
      "@/server/portals/request": { requestPortal: async () => ({ site: { id: "jobs" }, paths: { home: "/jobs", login: "/jobs/login", signup: "/jobs/signup", gateway: "/jobs/gateway" } }) },
      "@/server/portals/session": { getPortalSession: async () => ({ userId: "participant-1" }) },
      "@/server/nicejobs/candidate-about-you": { candidateAboutYou: { readOnboardingProgress: async () => ({ aboutYou: null, ecosystemCompletedAt: null }) } },
      "@/server/group/structure": { groupCompanies: [] },
      "@/app/sites/jobs-ui/auth-shell": { JobsAuthShell: () => null },
      "@/app/app/nicejobs/ecosystem-action": { completeOpportunityEcosystemAction: "#complete" },
      "../opportunity-ecosystem.module.css": css
    });
    await expect(Page({ params: Promise.resolve({ site: "jobs" }), searchParams: Promise.resolve({}) })).rejects.toThrow("Redirect /jobs/signup/about-you");
  });

  it("keeps four cards in two columns on wider screens and one column on narrow screens", () => {
    const styles = readFileSync("src/app/sites/[site]/signup/opportunity-ecosystem.module.css", "utf8");
    expect(styles).toContain(".grid { display: grid; grid-template-columns: 1fr;");
    expect(styles).toContain("@media (min-width: 340px) { .grid { grid-template-columns: repeat(2");
  });
});
