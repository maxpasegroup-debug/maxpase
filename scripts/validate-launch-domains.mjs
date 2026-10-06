/* global fetch, AbortSignal, console */
import process from "node:process";
import { URL } from "node:url";
import { performance } from "node:perf_hooks";
import { resolve4 } from "node:dns/promises";
import tls from "node:tls";
import { writeFileSync } from "node:fs";

const sites = [
  { host: "maxpase.com", brand: "MAXPASE", protectedPath: "/app/boss", corporate: true },
  { host: "airaskillcity.com", brand: "AIRA Skill City", protectedPath: "/gateway" },
  { host: "airastartupskool.com", brand: "AIRA Startup School", protectedPath: "/gateway" },
  { host: "airalabs.online", brand: "AIRA Labs", protectedPath: "/gateway" },
  { host: "nicejobs.online", brand: "Nice Jobs", protectedPath: "/gateway" }
];
function certificate(host) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port: 443, servername: host, rejectUnauthorized: true }, () => {
      const cert = socket.getPeerCertificate();
      const valid = socket.authorized && Date.parse(cert.valid_from) <= Date.now() && Date.parse(cert.valid_to) > Date.now();
      resolve({ status: valid ? "PASS" : "BLOCKED", issuer: cert.issuer?.O, validFrom: cert.valid_from, validUntil: cert.valid_to }); socket.end();
    });
    socket.setTimeout(15000, () => socket.destroy(new Error("TLS_TIMEOUT")));
    socket.once("error", reject);
  });
}
async function read(host, path, headers = {}) {
  const start = performance.now();
  const response = await fetch(`https://${host}${path}`, { redirect: "manual", signal: AbortSignal.timeout(20000), headers });
  const body = await response.text();
  return { status: response.status, elapsedMs: performance.now() - start, location: response.headers.get("location"), body };
}
const results = [];
for (const site of sites) {
  const row = { host: site.host, status: "BLOCKED" };
  try {
    row.dns = { status: "PASS", addresses: await resolve4(site.host) };
    row.tls = await certificate(site.host);
    const home = await read(site.host, "/"), login = await read(site.host, "/login");
    row.home = { httpStatus: home.status, elapsedMs: home.elapsedMs, correctBrand: home.body.toLowerCase().includes(site.brand.toLowerCase()), stayedAtRoot: home.status === 200 };
    row.login = { httpStatus: login.status, elapsedMs: login.elapsedMs, emailField: /name="email"/.test(login.body), credentialField: new RegExp(`name="${site.corporate ? "pin" : "password"}"`).test(login.body), expectedCredential: site.corporate ? "Boss PIN" : "portal password" };
    const protectedRead = await read(site.host, site.protectedPath);
    const loginRedirect = new URL(protectedRead.location ?? "/", `https://${site.host}`);
    row.anonymous = { httpStatus: protectedRead.status, loginRedirect: [302, 303, 307, 308].includes(protectedRead.status) && loginRedirect.hostname === site.host && loginRedirect.pathname === "/login" };
    if (!site.corporate) row.corporateRoute = { httpStatus: (await read(site.host, "/app/boss")).status };
    row.status = row.tls.status === "PASS" && row.home.correctBrand && row.home.stayedAtRoot && row.login.httpStatus === 200 && row.login.emailField && row.login.credentialField && row.anonymous.loginRedirect && (site.corporate || row.corporateRoute.httpStatus === 404) ? "PASS" : "BLOCKED";
  } catch (error) { row.failure = error.code ?? error.cause?.code ?? "NETWORK_OR_TLS_CHECK_FAILED"; }
  results.push(row); console.log(JSON.stringify(row));
}
const report = { measuredAt: new Date().toISOString(), mode: "READ-ONLY PUBLIC DNS/TLS/HTTP; NO AUTHENTICATION OR PRODUCTION MUTATIONS", status: results.every(r => r.status === "PASS") ? "PASS" : "BLOCKED", sessionIsolation: "UNIT REGRESSION REQUIRED; LIVE LOGGED-IN CROSS-HOST CHECK NOT RUN", results };
writeFileSync("docs/audit/BOSS_LAUNCH_DOMAINS.json", JSON.stringify(report, null, 2) + "\n");
if (report.status !== "PASS") process.exitCode = 1;
