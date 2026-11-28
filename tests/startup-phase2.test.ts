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
import { startupPublicDraftInput, startupPublicSubmissionInput } from "@/server/portals/startup-public-admissions";

const localRequire = createRequire(import.meta.url);
const compiled = transpileModule(readFileSync("src/app/sites/startup-ui/landing.tsx", "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
const moduleTarget = { exports: {} };
const Icon = () => createElement("span", null);
runInNewContext(compiled, { module: moduleTarget, exports: moduleTarget.exports, require: (name: string) => ({
  "next/link": { __esModule: true, default: ({ href, children }: { href: string; children: ReactNode }) => createElement("a", { href }, children) },
  "next/image": { __esModule: true, default: ({ src, alt }: { src: string; alt: string }) => createElement("img", { src, alt }) },
  "next/font/local": { __esModule: true, default: () => ({ className: "test-font", variable: "test-display" }) },
  "lenis/dist/lenis.css": {},
  "./startup.css": {},
  "lucide-react": { ArrowDown: Icon, ArrowRight: Icon, ArrowUpRight: Icon },
  "./sia-assistant": { StartupSiaAssistant: () => createElement("span", null, "SIA guidance") }
} as Record<string, unknown>)[name] ?? localRequire(name) });
const StartupLanding = (moduleTarget.exports as { StartupLanding: ComponentType<{ home: string; login: string; name: string; description: string; image: string; ecosystem: string; focus: readonly string[]; faqs: readonly (readonly [string, string])[] }> }).StartupLanding;
const publicAppCompiled = transpileModule(readFileSync("src/app/sites/startup-ui/public-application.tsx", "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
const publicAppTarget = { exports: {} };
const PublicIcon = () => createElement("span", null);
runInNewContext(publicAppCompiled, { module: publicAppTarget, exports: publicAppTarget.exports, require: (name: string) => ({
  "next/link": { __esModule: true, default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => createElement("a", { href, className }, children) },
  "react": localRequire("react"), "react/jsx-runtime": localRequire("react/jsx-runtime"),
  "./public-application.css": {}, "lucide-react": { ArrowLeft: PublicIcon, ArrowRight: PublicIcon, Sparkles: PublicIcon }
} as Record<string, unknown>)[name] ?? localRequire(name) });
const PublicStartupApplication = (publicAppTarget.exports as { PublicStartupApplication: ComponentType }).PublicStartupApplication;
const applicationCompiled = transpileModule(readFileSync("src/app/sites/startup-ui/startup-application.tsx", "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
const applicationTarget = { exports: {} };
runInNewContext(applicationCompiled, { module: applicationTarget, exports: applicationTarget.exports, require: (name: string) => ({
  "next/link": { __esModule: true, default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => createElement("a", { href, className }, children) },
  "react": localRequire("react"), "react/jsx-runtime": localRequire("react/jsx-runtime"),
  "./startup-application.css": {}, "lucide-react": { ArrowRight: PublicIcon }
} as Record<string, unknown>)[name] ?? localRequire(name) });
const StartupApplicationPage = (applicationTarget.exports as { StartupApplicationPage: ComponentType<{ home: string; login: string }> }).StartupApplicationPage;

const previousSecret = process.env.AUTH_SECRET;
beforeAll(() => { process.env.AUTH_SECRET = randomBytes(32).toString("base64url"); });
afterAll(() => { if (previousSecret === undefined) delete process.env.AUTH_SECRET; else process.env.AUTH_SECRET = previousSecret; });

describe("Startup Skool application entry", () => {
  it("routes only the Startup Skool signup path through its own domain", async () => {
    const startup = await middleware(new NextRequest("https://airastartupskool.com/signup", { headers: { host: "airastartupskool.com" } }));
    expect(startup.headers.get("x-middleware-rewrite")).toContain("/sites/startup/signup");
    const publicApplication = await middleware(new NextRequest("https://airastartupskool.com/apply", { headers: { host: "airastartupskool.com" } }));
    expect(publicApplication.headers.get("x-middleware-rewrite")).toContain("/sites/startup/apply");
    expect(publicApplication.status).toBe(200);
    const labs = await middleware(new NextRequest("https://airalabs.online/signup", { headers: { host: "airalabs.online" } }));
    expect(labs.status).toBe(404);
    const labsApplication = await middleware(new NextRequest("https://airalabs.online/apply", { headers: { host: "airalabs.online" } }));
    expect(labsApplication.status).toBe(404);
    const publicApi = await middleware(new NextRequest("https://airastartupskool.com/api/startup/public-application/draft", { method: "POST", headers: { host: "airastartupskool.com", origin: "https://airastartupskool.com" } }));
    expect(publicApi.status).toBe(200);
    expect(publicApi.headers.get("x-middleware-rewrite")).toBeNull();
    const removedOtp = await middleware(new NextRequest("https://airastartupskool.com/api/startup/public-application/otp-send", { method: "POST", headers: { host: "airastartupskool.com", origin: "https://airastartupskool.com" } }));
    expect(removedOtp.status).toBe(404);
    const crossBrandApi = await middleware(new NextRequest("https://airalabs.online/api/startup/public-application/draft", { method: "POST", headers: { host: "airalabs.online", origin: "https://airalabs.online" } }));
    expect(crossBrandApi.status).toBe(404);
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
    const html = renderToStaticMarkup(createElement(StartupLanding, { home: paths.home, login: paths.login, name: site.name, description: site.description, image: site.image, ecosystem: "https://airaskillcity.com", focus: site.focus, faqs: [] }));
    expect(html).toContain('href="/apply"');
    expect(html).toContain("https://wa.me/918590540657?text=");
    expect(html).toContain("Chat with AIRA Startup Skool admissions on WhatsApp");
    expect(html).not.toContain("SIA guidance");
    expect(html).not.toContain("Join Now");
    expect(html).toContain("Not an entrepreneur? Become one.");
    expect(html).toContain("AIRA STARTUP SKOOL</a>");
    expect(html).toContain("Log in</a>");
    expect(html.match(/Apply now/g)?.length).toBeGreaterThan(0);
    expect(html).toContain("AIRA Skill City Private Limited");
    expect(html).not.toContain("₹35,000");
    expect(html).not.toContain("Pay now");
  });

  it("renders the application as a page without modal controls", () => {
    const html = renderToStaticMarkup(createElement(StartupApplicationPage, { home: "/", login: "/login" }));
    expect(html).toContain("startup-application-page");
    expect(html).toContain("Make your first move.");
    expect(html).toContain('href="/login"');
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain("Close application");
    expect(html).not.toContain("Continue to verification");
    expect(html).not.toContain("Send code");
    expect(html).toContain("1 · Your details");
    expect(html).toContain("2 · Location &amp; apply");
  });

  it("renders the public SIA application connected to secure draft-backed actions", () => {
    const html = renderToStaticMarkup(createElement(PublicStartupApplication));
    expect(html).toContain("SIA - APPLICATION GUIDE");
    expect(html).toContain("get started.");
    expect(html).toContain("Application draft:");
    expect(html).toContain("Opening your secure application draft");
    expect(html).not.toContain("Create an account");
  });

  it("accepts resumable partial drafts but requires complete application data and consent at submission", () => {
    expect(startupPublicDraftInput.safeParse({ fullName: "", mobile: "", programPreference: "" }).success).toBe(true);
    const submitted = { fullName: "Asha Menon", mobile: "+919876543210", whatsapp: "+919876543210", email: "asha@example.test", education: "UNDERGRADUATE", dateOfBirth: "2001-01-20", country: "IN", state: "Kerala", city: "Kochi", discoverySource: "FACEBOOK", consent: true };
    expect(startupPublicSubmissionInput.safeParse(submitted).success).toBe(true);
    expect(startupPublicSubmissionInput.safeParse({ ...submitted, mobile: "9876543210" }).success).toBe(false);
    expect(startupPublicSubmissionInput.safeParse({ ...submitted, consent: false }).success).toBe(false);
    expect(startupPublicSubmissionInput.safeParse({ ...submitted, email: "" }).success).toBe(false);
    expect(startupPublicSubmissionInput.safeParse({ ...submitted, whatsapp: "" }).success).toBe(false);
    expect(startupPublicSubmissionInput.safeParse({ ...submitted, country: "" }).success).toBe(false);
    expect(startupPublicSubmissionInput.safeParse({ ...submitted, discoverySource: "" }).success).toBe(false);
    expect(startupPublicSubmissionInput.safeParse({ ...submitted, discoverySource: "UNKNOWN" }).success).toBe(false);
    expect(startupPublicSubmissionInput.safeParse({ ...submitted, programPreference: "MBA" }).success).toBe(false);
    expect(startupPublicSubmissionInput.safeParse({ ...submitted, education: "SECRET", dateOfBirth: "2999-01-20", country: "India" }).success).toBe(false);
  });
});
