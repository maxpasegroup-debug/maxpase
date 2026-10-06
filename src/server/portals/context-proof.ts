import { siteById, siteByHost, type PortalSite } from "./sites";
const encoder = new TextEncoder();
async function key(secret: string) { return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]); }
export async function signPortalContext(site: PortalSite, host: string, secret: string, now = Date.now()) {
  if (secret.length < 32 || siteByHost(host)?.id !== site.id) throw new Error("Gateway context unavailable");
  const body = btoa(JSON.stringify({ id: site.id, host, time: now }));
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", await key(secret), encoder.encode("portal-context-v1:" + body)));
  return body + "." + [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
}
export async function verifyPortalContext(value: string | null, secret: string, now = Date.now()) {
  if (!value || value.length > 1000 || secret.length < 32) return null;
  try {
    const parts = value.split("."); if (parts.length !== 2 || !/^[a-f0-9]{64}$/.test(parts[1])) return null;
    const payload = JSON.parse(atob(parts[0]));
    if (typeof payload.id !== "string" || typeof payload.host !== "string" || !Number.isSafeInteger(payload.time) || payload.time > now + 5000 || now - payload.time > 120000) return null;
    const site = siteById(payload.id); if (!site || siteByHost(payload.host)?.id !== site.id) return null;
    const signature = new Uint8Array(parts[1].match(/../g)!.map(b => parseInt(b, 16)));
    if (!await crypto.subtle.verify("HMAC", await key(secret), signature, encoder.encode("portal-context-v1:" + parts[0]))) return null;
    return { site, host: payload.host as string };
  } catch { return null; }
}
