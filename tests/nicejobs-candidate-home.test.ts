import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { transpileModule, ModuleKind, JsxEmit } from "typescript";
import { describe, expect, it, vi } from "vitest";
import { createParticipantDashboard } from "@/server/nicejobs/participant-dashboard";
import { dashboardSection, dashboardSections } from "@/lib/nicejobs-dashboard";

const nativeRequire = createRequire(import.meta.url);
const css = new Proxy({}, { get: (_target, key) => typeof key === "string" ? key : undefined });
const Link = ({ children, ...props }: { children: ReactNode; href: string }) => createElement("a", props, children);
const Image = ({ fill: _fill, priority: _priority, sizes: _sizes, ...props }: { src: string; alt: string; fill?: boolean; priority?: boolean; sizes?: string }) => createElement("img", props);

function load<T>(path: string, mocks: Record<string, unknown>): T {
  const code = transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const target = { exports: {} };
  runInNewContext(code, { module: target, exports: target.exports, require: (name: string) => name in mocks ? mocks[name] : nativeRequire(name) });
  return target.exports as T;
}

const empty = { status: "AVAILABLE", data: { records: [], nextCursor: null } };
const published = { id: "published-id", title: "Verified role", description: "Practical work with approved terms.", engagement: "PART_TIME", company: "AIRA Skill City", disclosure: { legalEmployer: "AIRA Skill City Private Limited" } };
const application = { reference: "own-reference", title: "My application", status: "SUBMITTED", nextStep: "Application under review" };

async function renderCandidate(data: unknown, name = "Maya") {
  const { CandidateHome } = load<{ CandidateHome: (props: { userId: string; base: string; name: string }) => Promise<ReactNode> }>("src/app/app/nicejobs/candidate-home.tsx", {
    "next/link": Link,
    "next/image": Image,
    "./candidate-home.module.css": css,
    "@/server/nicejobs/participant-dashboard": { participantDashboard: { candidateHome: async () => data } }
  });
  return renderToStaticMarkup(await CandidateHome({ userId: "own-user", base: "/sites/jobs/gateway", name }));
}

describe("Nice Jobs candidate home", () => {
  it("reads only self-scoped applications and publication-filtered opportunities", async () => {
    const list = vi.fn(async () => ({ records: [], nextCursor: null }));
    const opportunities = vi.fn(async () => ({ records: [], nextCursor: null }));
    const day = vi.fn(), training = vi.fn();
    const dashboard = createParticipantDashboard({ account: {} as never, applications: { list, opportunities } as never, onboarding: { list: training } as never, employee: { day } as never, knowledge: {} as never, operations: {} as never });
    const result = await dashboard.candidateHome("own-user");
    expect(result.applications.status).toBe("AVAILABLE");
    expect(list).toHaveBeenCalledWith("own-user", true, { limit: 3 });
    expect(opportunities).toHaveBeenCalledWith("own-user", { limit: 3 });
    expect(day).not.toHaveBeenCalled();
    expect(training).not.toHaveBeenCalled();
  });

  it("loads My Space without an unused opportunity or worker-day read", async () => {
    const list = vi.fn(async () => ({ records: [], nextCursor: null }));
    const learning = vi.fn(async () => ({ records: [], nextCursor: null }));
    const opportunities = vi.fn(), day = vi.fn();
    const dashboard = createParticipantDashboard({ account: {} as never, applications: { list, opportunities } as never, onboarding: { list: learning } as never, employee: { day } as never, knowledge: {} as never, operations: {} as never });
    const result = await dashboard.candidateSpace("own-user");
    expect(result.applications.status).toBe("AVAILABLE");
    expect(result.learning.status).toBe("AVAILABLE");
    expect(list).toHaveBeenCalledWith("own-user", true, { limit: 5, recent: true });
    expect(learning).toHaveBeenCalledWith("own-user", true, { limit: 5 });
    expect(opportunities).not.toHaveBeenCalled();
    expect(day).not.toHaveBeenCalled();
  });

  it("shows the signed-in name, a real published preview, and recorded application status", async () => {
    const html = await renderCandidate({ applications: { status: "AVAILABLE", data: { records: [application] } }, opportunities: { status: "AVAILABLE", data: { records: [published] } } }, "Maya & Co");
    expect(html).toContain("Hello, Maya &amp; Co.");
    expect(html).toContain("Verified role");
    expect(html).toContain("Practical work with approved terms.");
    expect(html).toContain("Application under review");
    expect(html).toContain('href="/sites/jobs/gateway?view=opportunities&amp;versionId=published-id"');
    expect(html).toContain('href="/sites/jobs/gateway?view=my-applications&amp;reference=own-reference"');
    expect(html).not.toContain("My Earnings");
    expect(html).not.toContain("PRIVATE DRAFT");
  });

  it("distinguishes empty records from unavailable data", async () => {
    const emptyHtml = await renderCandidate({ applications: empty, opportunities: empty });
    expect(emptyHtml).toContain("You have no applications yet.");
    expect(emptyHtml).toContain("No approved opportunities are open for applications right now.");
    const unavailable = await renderCandidate({ applications: { status: "UNAVAILABLE", data: null }, opportunities: { status: "UNAVAILABLE", data: null } });
    expect(unavailable).toContain("Application updates are temporarily unavailable.");
    expect(unavailable).toContain("This information is temporarily unavailable.");
    expect(unavailable).not.toContain("You have no applications yet.");
  });

  it("keeps restricted opportunities distinct and links to the existing profile view", async () => {
    const html = await renderCandidate({ applications: empty, opportunities: { status: "UNAUTHORIZED", data: null } });
    expect(html).toContain("Opportunities are not available to this account.");
    expect(html).toContain('href="/sites/jobs/gateway?view=worker-profile"');
    expect(html).not.toContain("No approved opportunities are open for applications right now.");
  });

  it("uses one three-destination workspace navigation and existing sign-out", () => {
    const { DashboardShell } = load<{ DashboardShell: (props: { base: string; view: string; name: string; email: string; unread: number; candidate: boolean; logout: ReactNode; children: ReactNode }) => ReactNode }>("src/app/app/nicejobs/dashboard-shell.tsx", { "@/lib/nicejobs-dashboard": { dashboardSection, dashboardSections } });
    const html = renderToStaticMarkup(createElement(DashboardShell, { base: "/sites/jobs/gateway", view: "home", name: "Maya", email: "maya@example.invalid", unread: 0, candidate: true, logout: createElement("button", null, "Logout"), children: null }));
    const bottom = html.slice(html.indexOf('aria-label="Quick navigation"'));
    for (const view of ["home", "opportunities", "worker-wallet"]) expect(bottom).toContain(`view=${view}`);
    expect(html).toContain("Logout");
    expect(html).toContain("My Workspace");
    expect(html).toContain("Marketplace");
    expect(html).not.toContain("nj-dashboard-sidebar");
    expect(bottom).not.toContain("view=worker-profile");
  });
});

describe("Nice Jobs candidate gateway", () => {
  const paths = { home: "/sites/jobs", login: "/sites/jobs/login", gateway: "/sites/jobs/gateway" };
  const site = { id: "jobs" };
  function gateway(session: { userId: string } | null, access: () => Promise<unknown>) {
    const redirect = vi.fn((url: string) => { throw new Error(`Redirect ${url}`); });
    const participant = vi.fn(({ userId }: { userId: string }) => createElement("p", null, userId));
    const policy = vi.fn(access);
    const mocks: Record<string, unknown> = {
      "next/link": Link,
      "next/navigation": { redirect, notFound: () => { throw new Error("Not found"); } },
      "@/server/portals/request": { requestPortal: async () => ({ site, paths }) },
      "@/server/portals/session": { getPortalSession: async () => session },
      "@/server/security/rate-limit": { consumeSecurityBudget: async () => {}, securityKey: () => "test-budget" },
      "@/lib/nicejobs-control-navigation": { isNiceJobsControlView: () => false },
      "@/lib/nicejobs-dashboard": { isParticipantDashboardView: () => true },
      "@/server/portals/policy": { requirePortalAccess: policy },
      "@/server/db": { prisma: {} },
      "@/app/app/nicejobs/participant-dashboard": { ParticipantDashboard: participant }
    };
    const code = transpileModule(readFileSync("src/app/sites/[site]/gateway/page.tsx", "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    const target = { exports: {} as { default: (props: { params: Promise<{ site: string }>; searchParams: Promise<Record<string, string>> }) => Promise<ReactNode> } };
    runInNewContext(code, { module: target, exports: target.exports, require: (name: string) => name in mocks ? mocks[name] : name.startsWith("@/") || name.startsWith(".") ? {} : nativeRequire(name) });
    return { Gateway: target.exports.default, redirect, policy, participant };
  }

  it("redirects without a session before reading candidate data", async () => {
    const { Gateway, redirect, policy, participant } = gateway(null, async () => ({}));
    await expect(Gateway({ params: Promise.resolve({ site: "jobs" }), searchParams: Promise.resolve({ view: "home" }) })).rejects.toThrow("Redirect /sites/jobs/login");
    expect(redirect).toHaveBeenCalledWith("/sites/jobs/login");
    expect(policy).not.toHaveBeenCalled();
    expect(participant).not.toHaveBeenCalled();
  });

  it("uses the server session identity and requires portal access", async () => {
    const denied = gateway({ userId: "server-user" }, async () => { throw new Error("Denied"); });
    await expect(denied.Gateway({ params: Promise.resolve({ site: "jobs" }), searchParams: Promise.resolve({ view: "home", candidateId: "forged-user" }) })).rejects.toThrow("Denied");
    expect(denied.participant).not.toHaveBeenCalled();
    const allowed = gateway({ userId: "server-user" }, async () => ({}));
    const node = await allowed.Gateway({ params: Promise.resolve({ site: "jobs" }), searchParams: Promise.resolve({ view: "home", candidateId: "forged-user" }) });
    expect(renderToStaticMarkup(node)).toContain("server-user");
    expect(allowed.participant).toHaveBeenCalledWith(expect.objectContaining({ userId: "server-user" }), undefined);
  });
});
