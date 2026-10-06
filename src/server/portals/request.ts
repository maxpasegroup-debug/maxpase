import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { siteById, portalHostAllowed, localHost, portalPaths, validatePortalOrigin } from "./sites";
import { verifyPortalContext } from "./context-proof";

export async function requestPortal(id: string, mutation = false) {
  const site = siteById(id), h = await headers();
  const proof = await verifyPortalContext(h.get("x-maxpase-portal-context"), process.env.AUTH_SECRET ?? "");
  const host = site && proof?.site.id === site.id ? proof.host : h.get("host");
  if (!site || !portalHostAllowed(site, host, process.env.NODE_ENV !== "production")) notFound();
  const local = localHost(host);
  if (mutation) validatePortalOrigin(site, host, h.get("origin"), process.env.NODE_ENV !== "production");
  return { site, paths: portalPaths(site, local) };
}
