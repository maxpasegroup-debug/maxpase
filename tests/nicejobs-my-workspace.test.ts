import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { transpileModule, ModuleKind, JsxEmit } from "typescript";
import { describe, expect, it } from "vitest";
import { applicationStage } from "@/lib/nicejobs-application-stage";

const nativeRequire = createRequire(import.meta.url);
const Link = ({ children, ...props }: { children: ReactNode; href: string }) => createElement("a", props, children);
const css = new Proxy({}, { get: (_target, key) => typeof key === "string" ? key : undefined });

async function renderSpace(applications: unknown, learning: unknown, worker = false) {
  const source = readFileSync("src/app/app/nicejobs/candidate-space.tsx", "utf8");
  const code = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const target = { exports: {} as { CandidateSpace: (props: { userId: string; base: string; name: string; worker: boolean }) => Promise<ReactNode> } };
  const mocks: Record<string, unknown> = {
    "next/link": Link,
    "./candidate-space.module.css": css,
    "@/lib/nicejobs-application-stage": { applicationStage },
    "@/server/nicejobs/participant-dashboard": { participantDashboard: { candidateSpace: async () => ({ applications, learning }) } }
  };
  runInNewContext(code, { module: target, exports: target.exports, require: (name: string) => name in mocks ? mocks[name] : nativeRequire(name), encodeURIComponent });
  return renderToStaticMarkup(await target.exports.CandidateSpace({ userId: "server-user", base: "/sites/jobs/gateway", name: "Maya", worker }));
}

const empty = { status: "AVAILABLE", data: { records: [], hasMore: false } };

describe("Nice Jobs My Workspace", () => {
  it("keeps detailed decisions distinct from the three broad application stages", () => {
    expect(applicationStage("SUBMITTED")).toBe("Pending");
    expect(applicationStage("INTERVIEW")).toBe("Pending");
    expect(applicationStage("APPROVED")).toBe("Approved");
    expect(applicationStage("OFFER_ACCEPTED")).toBe("Approved");
    expect(applicationStage("REJECTED")).toBe("Declined");
    expect(applicationStage("OFFER_DECLINED")).toBe("Offer declined");
    expect(applicationStage("WITHDRAWN")).toBe("Withdrawn");
    expect(applicationStage("CLOSED")).toBe("Closed");
  });

  it("shows the eight compact destinations and candidate activation boundaries", async () => {
    const html = await renderSpace(empty, empty);
    for (const label of ["My Workspace", "Explore Opportunities", "My Applications", "My Work", "Training", "Daily Reports", "Marketplace", "My Wallet"]) expect(html).toContain(label);
    expect(html).toContain("After activation");
    expect(html).toContain("No jobs in your workspace yet");
    expect(html).toContain("does not grant work access");
    expect(html).toContain('href="/sites/jobs/gateway?view=my-work"');
    expect(html).toContain('href="/sites/jobs/gateway?view=worker-reports"');
  });

  it("renders a real application in its own job space without claiming work activation", async () => {
    const applications = { status: "AVAILABLE", data: { records: [{ reference: "123e4567-e89b-42d3-a456-426614174000", title: "Recorded role", company: "AIRA Skill City", division: "Skill Studio", status: "SUBMITTED", nextStep: "Application under review" }], hasMore: false } };
    const html = await renderSpace(applications, empty);
    expect(html).toContain("Recorded role");
    expect(html).toContain("Pending");
    expect(html).toContain("submitted");
    expect(html).toContain("Application under review");
    expect(html).toContain("view=job-space&amp;reference=123e4567-e89b-42d3-a456-426614174000");
    expect(html).not.toContain("Active work assignment");
  });

  it("does not turn unavailable reads into empty records", async () => {
    const html = await renderSpace({ status: "UNAVAILABLE", data: null }, { status: "UNAVAILABLE", data: null });
    expect(html).toContain("temporarily unavailable");
    expect(html).not.toContain("No jobs in your workspace yet");
  });
});
