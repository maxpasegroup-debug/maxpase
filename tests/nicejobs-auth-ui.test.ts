import { createElement, type ComponentType, type ReactNode } from "react";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { transpileModule, ModuleKind, JsxEmit } from "typescript";
import { describe, expect, it } from "vitest";

const nativeRequire = createRequire(import.meta.url);
const css = new Proxy({}, { get: (_target, key) => typeof key === "string" ? key : undefined });
const Link = ({ children, ...props }: { children: ReactNode; href: string }) => createElement("a", props, children);
const Image = ({ fill: _fill, priority: _priority, sizes: _sizes, ...props }: { src: string; alt: string; fill?: boolean; priority?: boolean; sizes?: string }) => createElement("img", props);
const paths = { home: "/sites/jobs", login: "/sites/jobs/login", signup: "/sites/jobs/signup" };

function load<T>(path: string, mocks: Record<string, unknown>): T {
  const code = transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const target = { exports: {} };
  runInNewContext(code, { module: target, exports: target.exports, require: (name: string) => name in mocks ? mocks[name] : nativeRequire(name) });
  return target.exports as T;
}

function surfaces(state: { challengeId?: string; message?: string; complete?: boolean; error?: string } = {}, pending = false) {
  const react = { ...React, useActionState: () => [state, () => {}, pending] };
  const common = { react, "next/link": Link, "../jobs-ui/auth.module.css": css, "../../jobs-ui/auth.module.css": css, "./auth.module.css": css };
  const { JobsAuthShell } = load<{ JobsAuthShell: ComponentType<Record<string, unknown>> }>("src/app/sites/jobs-ui/auth-shell.tsx", { ...common, "next/image": Image });
  const { PasswordField } = load<{ PasswordField: ComponentType<Record<string, unknown>> }>("src/app/sites/jobs-ui/password-field.tsx", common);
  const shared = { JobsAuthShell };
  const password = { PasswordField };
  const email = load<{ JobsEmailAuthForm: ComponentType<Record<string, unknown>>; JobsCodeFields: ComponentType<Record<string, unknown>> }>("src/app/sites/[site]/email-auth-form.tsx", { ...common, "../jobs-ui/auth-shell": shared, "../jobs-ui/password-field": password, "./actions": { jobsEmailLoginAction: () => {}, jobsPasswordResetAction: () => {} } });
  return { email };
}

describe("Nice Jobs legacy activation email screens", () => {

  it("renders legacy password login with recovery link", () => {
    const { JobsEmailAuthForm } = surfaces().email;
    const html = renderToStaticMarkup(createElement(JobsEmailAuthForm, { paths }));
    expect(html).toContain('name="email"');
    expect(html).toContain('name="password"');
    expect(html).toContain("Show password");
    expect(html).toContain('href="/sites/jobs/legacy-recovery"');
    expect(html).toContain("Continue to email code");
    expect(html).not.toContain("Six-digit email code");
  });

  it("shows a safe inline failure and prevents repeat submission while pending", () => {
    const failed = renderToStaticMarkup(createElement(surfaces({ error: "Could not sign in." }).email.JobsEmailAuthForm, { paths }));
    expect(failed).toContain('role="alert"');
    expect(failed).toContain("Could not sign in.");
    const pending = renderToStaticMarkup(createElement(surfaces({}, true).email.JobsEmailAuthForm, { paths }));
    expect(pending).toContain('aria-busy="true"');
    expect(pending).toContain("Please wait...");
    expect(pending).toContain("disabled");
  });

  it("renders the one-time code step without repeating the password field", () => {
    const { JobsEmailAuthForm } = surfaces({ challengeId: "fixture-challenge", message: "If valid, a code will arrive." }).email;
    const html = renderToStaticMarkup(createElement(JobsEmailAuthForm, { paths }));
    expect(html).toContain('name="code"');
    expect(html).toContain('pattern="[0-9]{6}"');
    expect(html).toContain('name="challengeId" value="fixture-challenge"');
    expect(html).not.toContain('name="password"');
    expect(html).toContain('role="status"');
  });

  it("renders reset request, reset proof, and completed recovery distinctly", () => {
    const initial = renderToStaticMarkup(createElement(surfaces().email.JobsEmailAuthForm, { paths, reset: true }));
    expect(initial).toContain('name="email"');
    expect(initial).not.toContain('name="password"');
    const proof = renderToStaticMarkup(createElement(surfaces({ challengeId: "fixture" }).email.JobsEmailAuthForm, { paths, reset: true }));
    expect(proof).toContain('name="code"');
    expect(proof).toContain('name="confirmPassword"');
    const complete = renderToStaticMarkup(createElement(surfaces({ complete: true }).email.JobsEmailAuthForm, { paths, reset: true }));
    expect(complete).toContain("Continue to phone activation");
    expect(complete).not.toContain("<form");
  });
});
