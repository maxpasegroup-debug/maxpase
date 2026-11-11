import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { transpileModule, ModuleKind, JsxEmit } from "typescript";
import { describe, expect, it, vi } from "vitest";

const nativeRequire = createRequire(import.meta.url);
const css = new Proxy({}, { get: (_target, key) => typeof key === "string" ? key : undefined });
const Link = ({ children, ...props }: { children: ReactNode; href: string }) => createElement("a", props, children);
function load<T>(path: string, mocks: Record<string, unknown>): T {
  const code = transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const target = { exports: {} };
  runInNewContext(code, { module: target, exports: target.exports, require: (name: string) => name in mocks ? mocks[name] : nativeRequire(name) });
  return target.exports as T;
}

describe("Nice Jobs registration continuation screens", () => {
  it("takes the Welcome screen Continue button to Tell us about yourself", async () => {
    const { default: Complete } = load<{ default: (props: { params: Promise<{ site: string }> }) => Promise<ReactNode> }>("src/app/sites/[site]/signup/complete/page.tsx", {
      "next/link": Link,
      "next/navigation": { notFound: () => { throw new Error("Not found"); }, redirect: (url: string) => { throw new Error(`Redirect ${url}`); } },
      "next/image": { default: () => null },
      "@/server/portals/request": { requestPortal: async () => ({ site: { id: "jobs" }, paths: { home: "/sites/jobs", login: "/sites/jobs/login", signup: "/sites/jobs/signup", gateway: "/sites/jobs/gateway" } }) },
      "@/server/portals/session": { getPortalSession: async () => ({ userId: "participant-1" }) },
      "../../../jobs-ui/auth.module.css": css
    });
    const html = renderToStaticMarkup(await Complete({ params: Promise.resolve({ site: "jobs" }) }));
    expect(html).toContain("Welcome to NICEJOBS!");
    expect(html).toContain('href="/sites/jobs/signup/about-you"');
    expect(html).toContain("Continue");
  });

  it("loads a returning participant's saved choice on the About You screen", async () => {
    const read = vi.fn(async () => "CURRENTLY_EMPLOYED");
    const JobsAuthShell = ({ title, description, children }: { title: string; description: string; children: ReactNode }) => createElement("main", null, createElement("h1", null, title), createElement("p", null, description), children);
    const AboutYouForm = ({ initial }: { initial: string }) => createElement("form", { "data-saved-choice": initial }, "What best describes you?");
    const { default: AboutYouPage } = load<{ default: (props: { params: Promise<{ site: string }> }) => Promise<ReactNode> }>("src/app/sites/[site]/signup/about-you/page.tsx", {
      "next/navigation": { notFound: () => { throw new Error("Not found"); }, redirect: (url: string) => { throw new Error(`Redirect ${url}`); } },
      "@/server/portals/request": { requestPortal: async () => ({ site: { id: "jobs" }, paths: { home: "/sites/jobs", login: "/sites/jobs/login", signup: "/sites/jobs/signup" } }) },
      "@/server/portals/session": { getPortalSession: async () => ({ userId: "participant-1" }) },
      "@/server/nicejobs/candidate-about-you": { candidateAboutYou: { read } },
      "@/app/sites/jobs-ui/auth-shell": { JobsAuthShell },
      "@/app/app/nicejobs/about-you-form": { AboutYouForm }
    });
    const html = renderToStaticMarkup(await AboutYouPage({ params: Promise.resolve({ site: "jobs" }) }));
    expect(html).toContain("Tell us about yourself");
    expect(html).toContain("This helps us understand your current situation.");
    expect(html).toContain('data-saved-choice="CURRENTLY_EMPLOYED"');
    expect(read).toHaveBeenCalledWith("participant-1");
  });

  it("makes the same saved choice editable in My Profile", async () => {
    const read = vi.fn(async () => "SELF_EMPLOYED");
    const AboutYouForm = ({ initial, mode }: { initial: string; mode: string }) => createElement("form", { "data-saved-choice": initial, "data-mode": mode });
    const { AboutYouProfile } = load<{ AboutYouProfile: (props: { userId: string }) => Promise<ReactNode> }>("src/app/app/nicejobs/about-you-profile.tsx", {
      "@/server/nicejobs/candidate-about-you": { candidateAboutYou: { read } },
      "./about-you-form": { AboutYouForm }
    });
    const html = renderToStaticMarkup(await AboutYouProfile({ userId: "participant-1" }));
    expect(html).toContain('data-saved-choice="SELF_EMPLOYED"');
    expect(html).toContain('data-mode="PROFILE"');
    expect(read).toHaveBeenCalledWith("participant-1");
  });

  it("keeps the choice cards single-column on narrow screens and offers a two-column layout on wider screens", () => {
    const styles = readFileSync("src/app/app/nicejobs/about-you.module.css", "utf8");
    expect(styles).toContain(".options { display: grid; grid-template-columns: 1fr;");
    expect(styles).toContain("@media (min-width: 540px) { .options { grid-template-columns: repeat(2");
  });
});
