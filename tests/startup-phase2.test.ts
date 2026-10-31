import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { createElement, type ReactNode, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { transpileModule, ModuleKind, JsxEmit } from "typescript";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { portalPaths, siteById } from "@/server/portals/sites";
import { startupEmailSettings, StartupAuthUnavailable } from "@/server/portals/startup-auth";
import { startupApplicationInput } from "@/server/portals/startup-applications";

const localRequire = createRequire(import.meta.url);
const compiled = transpileModule(readFileSync("src/app/sites/startup-ui/landing.tsx", "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
const moduleTarget = { exports: {} };
const Icon = () => createElement("span", null);
runInNewContext(compiled, { module: moduleTarget, exports: moduleTarget.exports, require: (name: string) => ({
  "next/link": { __esModule: true, default: ({ href, children }: { href: string; children: ReactNode }) => createElement("a", { href }, children) },
  "next/image": { __esModule: true, default: ({ src, alt }: { src: string; alt: string }) => createElement("img", { src, alt }) },
  "next/font/google": { Instrument_Sans: () => ({ className: "test-font" }) },
  "lenis/dist/lenis.css": {},
  "./startup.css": {},
  "lucide-react": { ArrowDown: Icon, ArrowRight: Icon, ArrowUpRight: Icon },
  "./sia-assistant": { StartupSiaAssistant: () => createElement("span", null, "SIA guidance") }
} as Record<string, unknown>)[name] ?? localRequire(name) });
const StartupLanding = (moduleTarget.exports as { StartupLanding: ComponentType<{ home: string; login: string; signup: string; name: string; description: string; image: string; ecosystem: string; focus: readonly string[]; faqs: readonly (readonly [string, string])[] }> }).StartupLanding;

const previousSecret = process.env.AUTH_SECRET;
beforeAll(() => { process.env.AUTH_SECRET = randomBytes(32).toString("base64url"); });
afterAll(() => { if (previousSecret === undefined) delete process.env.AUTH_SECRET; else process.env.AUTH_SECRET = previousSecret; });

describe("Startup Skool application entry", () => {
  it("routes only the Startup Skool signup path through its own domain", async () => {
    const startup = await middleware(new NextRequest("https://airastartupskool.com/signup", { headers: { host: "airastartupskool.com" } }));
    expect(startup.headers.get("x-middleware-rewrite")).toContain("/sites/startup/signup");
    const labs = await middleware(new NextRequest("https://airalabs.online/signup", { headers: { host: "airalabs.online" } }));
    expect(labs.status).toBe(404);
  });

  it("keeps email verification disabled until distinct Startup configuration is present", () => {
    expect(() => startupEmailSettings({})).toThrow(StartupAuthUnavailable);
    expect(() => startupEmailSettings({ STARTUP_EMAIL_AUTH_ENABLED: "true", RESEND_API_KEY: "isolated-test-key", STARTUP_AUTH_FROM: "auth@test.invalid", STARTUP_OTP_SECRET: "changeme".repeat(8) })).toThrow(StartupAuthUnavailable);
    expect(startupEmailSettings({ STARTUP_EMAIL_AUTH_ENABLED: "true", RESEND_API_KEY: "isolated-test-key", STARTUP_AUTH_FROM: "auth@test.invalid", STARTUP_OTP_SECRET: randomBytes(32).toString("hex") }).STARTUP_EMAIL_AUTH_ENABLED).toBe("true");
  });

  it("requires complete, bounded application answers and explicit consent", () => {
    const valid = { tier: "STARTER", idea: "A practical customer problem I want to test", goal: "Interview five potential customers about it", experience: "I have begun exploring this idea", location: "Kerala", timeCommitment: "Five hours each week", consent: true };
    expect(startupApplicationInput.safeParse(valid).success).toBe(true);
    expect(startupApplicationInput.safeParse({ ...valid, tier: "SECRET", consent: false }).success).toBe(false);
    expect(startupApplicationInput.safeParse({ ...valid, idea: "Too short" }).success).toBe(false);
  });

  it("offers a guided application without presenting proposed fees or automatic admission", () => {
    const site = siteById("startup")!;
    const paths = portalPaths(site, true);
    const html = renderToStaticMarkup(createElement(StartupLanding, { home: paths.home, login: paths.login, signup: paths.signup, name: site.name, description: site.description, image: site.image, ecosystem: "https://airaskillcity.com", focus: site.focus, faqs: [] }));
    expect(html).toContain("/sites/startup/signup");
    expect(html).toContain("SIA guidance");
    expect(html).toContain("Apply to Startup Skool");
    expect(html).toContain("AIRA Skill City Private Limited");
    expect(html).not.toContain("₹35,000");
    expect(html).not.toContain("Pay now");
  });
});
