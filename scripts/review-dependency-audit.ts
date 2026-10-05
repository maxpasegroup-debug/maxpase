import { readFileSync } from "node:fs";

const report = JSON.parse(readFileSync(process.argv[2] ?? "dependency-audit.json", "utf8"));
if (!report.vulnerabilities || report.error) throw new Error("A successful dependency audit report is required");
const acceptedChain = new Set(["braces", "micromatch", "fast-glob", "@next/eslint-plugin-next", "eslint-config-next"]);
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const findings = Object.entries(report.vulnerabilities) as [string, { via: (string | { url: string })[]; nodes: string[] }][];
for (const [name, finding] of findings) {
  if (!acceptedChain.has(name) || !finding.nodes.length || !finding.via.every(v => typeof v === "string" ? acceptedChain.has(v) : v.url === "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm")) throw new Error("New or unreviewed dependency finding blocks release");
  for (const node of finding.nodes) {
    if (!lock.packages[node]?.dev) throw new Error("Runtime dependency risk cannot use the development exception");
  }
  console.log(`accepted development-only risk: ${name} (documented trusted-glob-only exposure)`);
}
console.log("PASS dependency report classification; exception requires release-owner review");
