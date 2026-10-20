import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { transpileModule, ModuleKind, JsxEmit } from "typescript";
import { describe, expect, it, vi } from "vitest";
import { isParticipantDashboardView } from "@/lib/nicejobs-dashboard";

const nativeRequire = createRequire(import.meta.url);
const css = new Proxy({}, { get: (_target, key) => typeof key === "string" ? key : undefined });
const Link = ({ children, ...props }: { children: ReactNode; href: string }) => createElement("a", props, children);
const reference = "123e4567-e89b-42d3-a456-426614174000";

function setup(status = "SUBMITTED", enrolled = false, active = false, denied = false) {
  const detail = vi.fn(async (_userId: string, _reference: string, own: boolean) => {
    if (denied) throw new Error("DENIED");
    expect(own).toBe(true);
    return { reference, title: "Academic Advisor", company: "AIRA Skill City", division: "Skill Studio", status, nextStep: "Await human review" };
  });
  const enrollment = vi.fn(async () => enrolled ? { status: "OJT" } : null);
  const day = vi.fn(async () => ({ assignment: { trainingReference: active ? "owned-db-id" : "other-db-id" } }));
  const findUnique = vi.fn(async () => ({ id: "owned-db-id" }));
  const code = transpileModule(readFileSync("src/app/app/nicejobs/job-space.tsx", "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const target = { exports: {} as { JobSpace: (props: { userId: string; realm: "jobs"; base: string; query: Record<string, string>; worker: boolean }) => Promise<ReactNode> } };
  const mocks: Record<string, unknown> = {
    "next/link": Link,
    "./job-space.module.css": css,
    "@/server/db": { prisma: { niceJobsApplication: { findUnique } } },
    "@/server/nicejobs/applications": { applicationService: { detail } },
    "@/server/nicejobs/onboarding": { onboardingService: { enrollment } },
    "@/server/nicejobs/employee": { employeeService: { day } },
    "@/server/nicejobs/participant-dashboard": { dashboardRead: async (read: () => Promise<unknown>) => { try { return { status: "AVAILABLE", data: await read() }; } catch { return { status: "UNAUTHORIZED", data: null }; } } },
    "./application-workspace": { ApplicationWorkspace: () => createElement("p", null, "Existing application workflow") },
    "./onboarding-workspace": { OnboardingWorkspace: () => createElement("p", null, "Existing training workflow") },
    "./employee-workspace": { EmployeeWorkspace: () => createElement("p", null, "Existing work workflow") },
    "./knowledge-workspace": { KnowledgeWorkspace: () => createElement("p", null, "Existing resources workflow") }
  };
  runInNewContext(code, { module: target, exports: target.exports, require: (name: string) => name in mocks ? mocks[name] : nativeRequire(name), encodeURIComponent });
  const render = async (query: Record<string, string> = {}, worker = false) => renderToStaticMarkup(await target.exports.JobSpace({ userId: "server-user", realm: "jobs", base: "/sites/jobs/gateway", query: { reference, ...query }, worker }));
  return { render, detail, enrollment, day, findUnique };
}

describe("Nice Jobs job space", () => {
  it("rejects invalid or unowned references before reading work and training", async () => {
    const invalid = setup();
    expect(await invalid.render({ reference: "forged" })).toContain("Job space unavailable");
    expect(invalid.detail).not.toHaveBeenCalled();
    const denied = setup("SUBMITTED", false, false, true);
    expect(await denied.render()).toContain("does not belong to your account");
    expect(denied.enrollment).not.toHaveBeenCalled();
    expect(denied.day).not.toHaveBeenCalled();
    expect(denied.findUnique).not.toHaveBeenCalled();
  });

  it("shows an application job tile without worker or earnings access", async () => {
    const fixture = setup();
    const html = await fixture.render({ tab: "work" });
    expect(fixture.detail).toHaveBeenCalledWith("server-user", reference, true);
    expect(html).toContain("Academic Advisor");
    expect(html).toContain("Await human review");
    expect(html).toContain("view=job-space&amp;reference=");
    expect(html).not.toContain("Existing work workflow");
    expect(html).not.toContain("tab=resources");
    expect(fixture.day).not.toHaveBeenCalled();
  });

  it("opens training only after accepted offer and recorded enrollment", async () => {
    const fixture = setup("OFFER_ACCEPTED", true);
    const html = await fixture.render({ tab: "training" });
    expect(html).toContain("Existing training workflow");
    expect(html).not.toContain("tab=work");
  });

  it("opens work and resources only for the matching active assignment", async () => {
    const other = setup("OFFER_ACCEPTED", true, false);
    expect(await other.render({ tab: "work" }, true)).not.toContain("Existing work workflow");
    const own = setup("OFFER_ACCEPTED", true, true);
    expect(await own.render({ tab: "work" }, true)).toContain("Existing work workflow");
    expect(await own.render({ tab: "resources" }, true)).toContain("Existing resources workflow");
    expect(await own.render({ tab: "earnings" }, true)).toContain("Open Wallet");
    expect(isParticipantDashboardView("job-space")).toBe(true);
    expect(isParticipantDashboardView("job-space", { control: "boss" })).toBe(false);
  });
});
