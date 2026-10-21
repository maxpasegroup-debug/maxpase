import { createElement, type ComponentType, type ReactNode } from "react";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { transpileModule, ModuleKind, JsxEmit } from "typescript";
import { describe, expect, it } from "vitest";

const nativeRequire = createRequire(import.meta.url), css = new Proxy({}, { get: (_target, key) => String(key) });
const Link = ({ children, ...props }: { children: ReactNode; href: string }) => createElement("a", props, children);
const paths = { home: "/sites/jobs", login: "/sites/jobs/login", signup: "/sites/jobs/signup" };
function load<T>(path: string, mocks: Record<string, unknown>): T {
  const code = transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const target = { exports: {} };
  runInNewContext(code, { module: target, exports: target.exports, require: (name: string) => name in mocks ? mocks[name] : nativeRequire(name), Intl });
  return target.exports as T;
}
function surfaces(state: Record<string, unknown> = {}, pending = false) {
  const react = { ...React, useActionState: () => [state, () => {}, pending] };
  const icons = { ArrowRight: () => null, ArrowLeft: () => null, BriefcaseBusiness: () => null, Eye: () => null, EyeOff: () => null, X: () => null };
  const common = { react, "next/link": Link, "lucide-react": icons, "./auth.module.css": css, "../jobs-ui/auth.module.css": css, "../../jobs-ui/auth.module.css": css };
  const { JobsAuthShell } = load<{ JobsAuthShell: ComponentType<Record<string, unknown>> }>("src/app/sites/jobs-ui/auth-shell.tsx", { ...common, "next/image": () => null });
  const phone = load<{ PhoneField: ComponentType<Record<string, unknown>> }>("src/app/sites/jobs-ui/phone-field.tsx", common);
  const pin = load<{ PinField: ComponentType<Record<string, unknown>> }>("src/app/sites/jobs-ui/pin-field.tsx", common);
  const components = { "../jobs-ui/auth-shell": { JobsAuthShell }, "../jobs-ui/phone-field": phone, "../jobs-ui/pin-field": pin };
  const auth = load<{ JobsPhoneAuthForm: ComponentType<Record<string, unknown>> }>("src/app/sites/[site]/phone-auth-form.tsx", { ...common, ...components, "./actions": { jobsPhoneLoginAction: () => {}, jobsPinResetAction: () => {} } });
  const signup = load<{ ApplicantPhoneSignupForm: ComponentType<Record<string, unknown>> }>("src/app/sites/[site]/signup/phone-form.tsx", { ...common, "../../jobs-ui/auth-shell": { JobsAuthShell }, "../../jobs-ui/phone-field": phone, "../../jobs-ui/pin-field": pin, "../actions": { jobsPhoneSignupAction: () => {}, jobsVerifyEmailAction: () => {} } });
  return { auth, signup };
}
describe("Nice Jobs candidate phone screens", () => {
  it("shows phone/PIN login and no email/password credential fields", () => {
    const html = renderToStaticMarkup(createElement(surfaces().auth.JobsPhoneAuthForm, { paths }));
    expect(html).toContain('name="country"'); expect(html).toContain('name="nationalNumber"'); expect(html).toContain('name="pin"');
    expect(html).toContain("Forgot PIN?"); expect(html).toContain("Create an account"); expect(html).not.toContain('name="email"');
  });
  it("shows mandatory recovery email, consent and two PIN fields at signup", () => {
    const html = renderToStaticMarkup(createElement(surfaces().signup.ApplicantPhoneSignupForm, { paths }));
    expect(html).toContain('name="displayName"'); expect(html).toContain('name="email"'); expect(html).toContain('name="confirmPin"');
    expect(html).toContain('name="acknowledge"'); expect(html).toContain("Phone ownership is not verified");
    expect(/<select[^>]*name="country"[\s\S]*?<\/select><input[^>]*name="nationalNumber"/.test(html)).toBe(true);
    expect(/<select[^>]*name="country"[^>]*><option value="IN"[^>]*>India \(\+91\)<\/option>/.test(html)).toBe(true);
    expect(html).not.toContain('type="search"');
    expect(html).not.toContain('aria-label="Selected calling code"');
    expect(html).toContain('name="pin"');
  });
  it("opens an OTP dialog after account creation with resend and edit-email choices", () => {
    const sent = renderToStaticMarkup(createElement(surfaces({ pendingVerification: true, challengeId: "fixture-challenge" }).signup.ApplicantPhoneSignupForm, { paths }));
    expect(sent).toContain("<dialog");
    expect(sent).toContain("Verify your email");
    expect(sent).toContain("Edit email");
    expect(sent).toContain("Resend code");
    expect(sent).toContain('name="challengeId" value="fixture-challenge"');
    const failed = renderToStaticMarkup(createElement(surfaces({ pendingVerification: true, error: "Delivery unavailable" }).signup.ApplicantPhoneSignupForm, { paths }));
    expect(failed).toContain("Your account is saved");
    expect(failed).toContain("Delivery unavailable");
    expect(failed).toContain("Send a new code");
  });
  it("shows recovery request, challenge and success as distinct states", () => {
    const initial = renderToStaticMarkup(createElement(surfaces().auth.JobsPhoneAuthForm, { paths, reset: true }));
    expect(initial).toContain('name="nationalNumber"'); expect(initial).not.toContain('name="email"');
    const proof = renderToStaticMarkup(createElement(surfaces({ challengeId: "challenge" }).auth.JobsPhoneAuthForm, { paths, reset: true }));
    expect(proof).toContain('name="code"'); expect(proof).toContain('name="confirmPin"');
    const done = renderToStaticMarkup(createElement(surfaces({ complete: true }).auth.JobsPhoneAuthForm, { paths, reset: true }));
    expect(done).toContain("Sign in with your new PIN"); expect(done).not.toContain("<form");
  });
});
