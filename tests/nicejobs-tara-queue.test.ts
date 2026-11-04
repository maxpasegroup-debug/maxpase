import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { transpileModule, ModuleKind, JsxEmit } from "typescript";
import type { ComponentType } from "react";

const nativeRequire = createRequire(import.meta.url);
function component<T>(file: string, name: string): ComponentType<T> {
  const code = transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, jsx: JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const target = { exports: {} as Record<string, ComponentType<T>> };
  runInNewContext(code, { module: target, exports: target.exports, require: nativeRequire });
  return target.exports[name];
}
const ManagerQueue = component<Record<string, unknown>>("src/app/app/nicejobs/manager-queue.tsx", "ManagerQueue");
const TaraTranscript = component<Record<string, unknown>>("src/app/app/nicejobs/tara-transcript.tsx", "TaraTranscript");

describe("Nice Jobs TARA and manager queue presentation", () => {
  it("separates unavailable management sources from genuinely empty groups and opens source records", () => {
    const html = renderToStaticMarkup(createElement(ManagerQueue, {
      queue: {
        applications: [{ id: "owned", title: "Academic Advisor", detail: "Submitted", href: "/app/nicejobs?view=applications&reference=owned" }],
        offers: [], training: null, missedTasks: [], help: [],
      }, route: (href: string) => href,
    }));
    expect(html).toContain("Academic Advisor");
    expect(html).toContain("reference=owned");
    expect(html).toContain("Training reviews assigned to you");
    expect(html).toContain("Not authorized in this scope.");
    expect(html).toContain("No records waiting in this view.");
    expect(html).not.toContain("Issue offer</button>");
  });
  it("shows the recorded prompt and escaped guidance without suggesting TARA can decide employment", () => {
    const response = { facts: [{ label: "Next step", value: "Human review", source: "application" }], signals: [], recommendations: [], actions: ["<script>Check your application</script>"], approvals: [], limitations: ["No employment decision was made."], provider: "DETERMINISTIC_DOMAIN_EVIDENCE", calculatedAt: "2026-11-05T00:00:00.000Z", context: {} };
    const html = renderToStaticMarkup(createElement(TaraTranscript, { turns: [{ id: "turn-1", prompt: "What happens after I submit?", response, at: new Date("2026-11-05T00:00:00.000Z"), provider: response.provider }] }));
    expect(html).toContain("What happens after I submit?");
    expect(html).toContain("Human review");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("A manager makes employment, disciplinary and pay decisions.");
  });
});
