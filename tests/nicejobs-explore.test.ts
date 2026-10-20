import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { transpileModule, ModuleKind, JsxEmit } from "typescript";
import { describe, expect, it, vi } from "vitest";
import { isParticipantDashboardView } from "@/lib/nicejobs-dashboard";

const nativeRequire = createRequire(import.meta.url);
const styles = new Proxy({}, { get: (_target, key) => typeof key === "string" ? key : undefined });
const Link = ({ children, ...props }: { children: ReactNode; href: string }) => createElement("a", props, children);

function load<T>(path: string, mocks: Record<string, unknown>): T {
  const code = transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const target = { exports: {} };
  runInNewContext(code, { module: target, exports: target.exports, URLSearchParams, require: (name: string) => name in mocks ? mocks[name] : nativeRequire(name) });
  return target.exports as T;
}

class AccessError extends Error {}
class NiceJobsUnavailable extends Error {}
const job = { id: "published-id", title: "Verified role", description: "Practical work with approved terms.", engagement: "CONTRACT", company: "AIRA Skill City", disclosure: { legalEmployer: "AIRA Skill City Private Limited" }, areas: [{ divisionId: "labs-id", division: { name: "AIRA Labs" } }] };

function setup(records: unknown[] = [job], nextCursor: string | null = null, failure?: Error) {
  const opportunities = vi.fn(async () => { if (failure) throw failure; return { records, nextCursor }; });
  const options = vi.fn(async () => ({ divisions: [{ id: "labs-id", name: "AIRA Labs" }] }));
  const safeDiagnostic = vi.fn();
  const { ExploreOpportunities, ExploreLoading } = load<{ ExploreOpportunities: (props: { userId: string; base: string; query: Record<string, string> }) => Promise<ReactNode>; ExploreLoading: () => ReactNode }>("src/app/app/nicejobs/explore-opportunities.tsx", {
    "next/link": Link,
    "./explore-opportunities.module.css": styles,
    "./opportunity-disclosure": { OpportunityDisclosure: ({ disclosure }: { disclosure: { legalEmployer: string } }) => createElement("p", null, disclosure.legalEmployer) },
    "@/server/nicejobs/applications": { applicationService: { opportunities, options } },
    "@/server/authorization/engine": { AccessError },
    "@/server/nicejobs/input": { NiceJobsUnavailable },
    "@/server/security/diagnostics": { safeDiagnostic }
  });
  const render = async (query: Record<string, string> = {}) => renderToStaticMarkup(await ExploreOpportunities({ userId: "server-user", base: "/sites/jobs/gateway", query }));
  return { render, opportunities, options, safeDiagnostic, loading: () => renderToStaticMarkup(createElement(ExploreLoading)) };
}

describe("Nice Jobs Explore Opportunities", () => {
  it("uses the signed-in identity, real title search and area filter, with no application or save command", async () => {
    const fixture = setup();
    const html = await fixture.render({ search: "Verified", divisionId: "labs-id" });
    expect(fixture.opportunities).toHaveBeenCalledWith("server-user", { search: "Verified", divisionId: "labs-id", limit: 12 });
    expect(fixture.options).toHaveBeenCalledWith("server-user", true);
    expect(html).toContain("Explore Opportunities");
    expect(html).toContain("Search job titles");
    expect(html).toContain("Verified role");
    expect(html).toContain('href="/sites/jobs/gateway?view=opportunities&amp;search=Verified&amp;divisionId=labs-id&amp;versionId=published-id"');
    expect(html).not.toContain("Start application");
    expect(html).not.toContain("Save job");
  });

  it("opens a published detail and hands off to the existing application form", async () => {
    const fixture = setup();
    const html = await fixture.render({ versionId: "published-id", search: "Verified" });
    expect(fixture.opportunities).toHaveBeenCalledWith("server-user", { versionId: "published-id", limit: 1 });
    expect(fixture.options).not.toHaveBeenCalled();
    expect(html).toContain("Terms and requirements");
    expect(html).toContain("The next screen opens the application form; this does not submit an application.");
    expect(html).toContain('href="/sites/jobs/gateway?view=opportunities&amp;search=Verified"');
    expect(html).toContain('href="/sites/jobs/gateway?view=apply&amp;versionId=published-id"');
  });

  it("distinguishes empty, filtered-empty and closed detail states", async () => {
    const fixture = setup([]);
    expect(await fixture.render()).toContain("No jobs are open right now");
    expect(await fixture.render({ search: "Advisor" })).toContain("No matching jobs");
    expect(await fixture.render({ versionId: "closed-id" })).toContain("This opportunity is not open");
    expect(fixture.loading()).toContain("Loading opportunities...");
  });

  it("keeps unavailable, authorization and unexpected errors separate", async () => {
    expect(await setup([], null, new NiceJobsUnavailable()).render()).toContain("Opportunities are temporarily unavailable");
    expect(await setup([], null, new AccessError()).render()).toContain("Opportunities are not available to this account");
    const failed = setup([], null, new Error("PRIVATE DATABASE DETAIL"));
    const html = await failed.render();
    expect(html).toContain("We could not load opportunities");
    expect(html).not.toContain("PRIVATE DATABASE DETAIL");
    expect(failed.safeDiagnostic).toHaveBeenCalledWith("operation_failed");
  });

  it("remains under the authenticated participant gateway", () => {
    expect(isParticipantDashboardView("opportunities")).toBe(true);
    expect(isParticipantDashboardView("apply")).toBe(true);
    expect(isParticipantDashboardView("opportunities", { control: "boss" })).toBe(false);
  });
});
