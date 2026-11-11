import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { transpileModule, ModuleKind, JsxEmit } from "typescript";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
function load<T>(path: string, mocks: Record<string, unknown>): T {
  const code = transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const target = { exports: {} as Record<string, unknown> };
  runInNewContext(code, { module: target, exports: target.exports, require: (name: string) => name in mocks ? mocks[name] : require(name) });
  return target.exports as T;
}

describe("AIRA Skill City public legal pages", () => {
  it("renders each page with consistent identity/contact and all related public links", () => {
    const links = {
      __esModule: true,
      default: ({ href, children }: { href: string; children: ReactNode }) => createElement("a", { href }, children),
    };
    const { AiraPublicLegalPage } = load<{ AiraPublicLegalPage: (props: { kind: "terms" | "privacy" | "refund-policy" | "contact" | "grievance"; home: string }) => ReturnType<typeof createElement> }>(
      "src/app/sites/skillcity-ui/public-legal-page.tsx",
      { "next/link": links, "./public-legal.module.css": {}, "@/server/portals/aira-public-legal": { airaPublicLegal: { publicName: "AIRA Skill City", legalEntityName: null, legalNameStatus: "PENDING_COI_CONFIRMATION", registeredOffice: "2619, T2, 6th Floor, HiLITE Business Park, HiLITE City, near Guruvayurappan College, Kozhikode, Kozhikode – 673014, Kerala, India", email: "hello@airaskillcity.com", phone: "+91 9074818881", website: "https://airaskillcity.com/" }, airaPublicLegalLinks: [{ href: "/terms", label: "Terms of Use" }, { href: "/privacy", label: "Privacy Policy" }, { href: "/refund-policy", label: "Refund & Cancellation Policy" }, { href: "/contact", label: "Contact Us" }, { href: "/grievance", label: "Grievance Redressal" }] } },
    );
    for (const kind of ["terms", "privacy", "refund-policy", "contact", "grievance"] as const) {
      const html = renderToStaticMarkup(createElement(AiraPublicLegalPage, { kind, home: "/sites/skillcity" }));
      expect(html).toContain("AIRA SKILL CITY");
      expect(html).toContain("being checked against the Certificate of Incorporation");
      expect(html).toContain("hello@airaskillcity.com");
      expect(html).toContain("+91 9074818881");
      expect(html).toContain("HiLITE Business Park");
      for (const path of ["terms", "privacy", "refund-policy", "contact", "grievance"]) expect(html).toContain(`href="/sites/skillcity/${path}"`);
    }
  });

  it("keeps uncertain identity, refund and grievance decisions explicitly unapproved", () => {
    const source = readFileSync("src/server/portals/aira-public-legal.ts", "utf8");
    const pages = readFileSync("src/app/sites/skillcity-ui/public-legal-page.tsx", "utf8");
    expect(source).toContain("legalEntityName: null");
    expect(source).toContain("PENDING_COI_CONFIRMATION");
    expect(pages).toContain("No universal refund period, processing deadline or no-refund rule");
    expect(pages).toContain("An authorized grievance officer’s name and designation have not been supplied");
  });
});
