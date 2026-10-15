import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getSession } from "@/server/auth/session";
import { getPortalSession } from "@/server/portals/session";
import { requestPortal } from "@/server/portals/request";
import { siteByHost } from "@/server/portals/sites";
import { validateActionOrigin } from "@/server/security/origin";
import { consumeSecurityBudget, securityKey, RateLimitError } from "@/server/security/rate-limit";
import { AccessError } from "@/server/authorization/engine";
import { z } from "zod";
import { contentFiles } from "./content-files";
import { MAX_CONTENT_BYTES } from "./content-validation";
import { NiceJobsError } from "./input";
let uploadsInFlight = 0;

async function actor(portal: boolean, mutation = false) {
  if (portal) { const { site } = await requestPortal("jobs", mutation); return (await getPortalSession(site))?.userId; }
  const h = await headers();
  if (siteByHost(h.get("host"))) throw new AccessError("Content unavailable");
  if (mutation) { try { validateActionOrigin(h.get("origin"), h.get("host"), process.env.APP_ORIGIN); } catch { throw new AccessError("Invalid request origin"); } }
  return (await getSession())?.userId;
}
function failure(error: unknown) {
  const status = error instanceof RateLimitError ? 429 : error instanceof AccessError ? 403 : error instanceof NiceJobsError || error instanceof z.ZodError || error instanceof URIError ? 400 : 503;
  return NextResponse.json({ error: status === 400 ? error instanceof NiceJobsError ? error.message : "Invalid upload request" : status === 403 ? "Content unavailable for this account" : status === 429 ? "Too many requests. Try again later." : "Private content temporarily unavailable" }, { status, headers: { "Cache-Control": "no-store" } });
}
export async function uploadContent(request: Request, portal: boolean) {
  let claimed = false;
  try {
    const userId = await actor(portal, true);
    if (!userId) return NextResponse.json({ error: "Sign in required" }, { status: 401, headers: { "Cache-Control":"no-store" } });
    await consumeSecurityBudget(securityKey("content-upload", userId), 10, 300);
    const organizationId = z.string().min(1).max(120).parse(request.headers.get("x-organization-id"));
    await contentFiles.preflight(userId, organizationId);
    if (uploadsInFlight >= 2) throw new RateLimitError();
    uploadsInFlight++; claimed = true;
    if (Number(request.headers.get("content-length")) > MAX_CONTENT_BYTES || !request.body) throw new NiceJobsError("Choose a file up to 64 MB");
    const reader = request.body.getReader(), chunks: Uint8Array[] = []; let length = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_,reject)=>{ timer=setTimeout(()=>reject(new NiceJobsError("Upload timed out. Retry the same file.")),120000); });
    try {
      for (;;) { const result = await Promise.race([reader.read(),deadline]); if (result.done) break; length += result.value.byteLength; if (length > MAX_CONTENT_BYTES) throw new NiceJobsError("Upload exceeds 64 MB"); chunks.push(result.value); }
    } finally { clearTimeout(timer); await reader.cancel(); reader.releaseLock(); }
    const file = await contentFiles.upload(userId, { organizationId, idempotencyKey: request.headers.get("x-upload-key"), filename: decodeURIComponent(request.headers.get("x-file-name") ?? ""), mime: request.headers.get("content-type") ?? "" }, Buffer.concat(chunks));
    return NextResponse.json({ id: file.id, filename: file.filename, mime: file.mime, mediaType: file.mediaType, bytes: file.bytes }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); } finally { if (claimed) uploadsInFlight--; }
}
export async function downloadContent(request: Request, versionId: string, portal: boolean) {
  try {
    const userId = await actor(portal);
    if (!userId) return new NextResponse("Sign in required", { status: 401, headers: { "Cache-Control": "no-store" } });
    await consumeSecurityBudget(securityKey("content-download", userId), 60, 60);
    z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/).parse(versionId);
    const url = new URL(request.url), management = url.searchParams.get("management") === "true";
    const { file, bytes } = await contentFiles.download(userId, versionId, management, url.searchParams.get("applicationReference") ?? undefined);
    const preview = url.searchParams.get("preview") === "true" && file.mediaType !== "PDF";
    const filename = encodeURIComponent(file.filename).replace(/['()*]/g,c=>"%"+c.charCodeAt(0).toString(16).toUpperCase());
    const responseHeaders = new Headers({ "Content-Type": file.mime, "Content-Disposition": `${preview ? "inline" : "attachment"}; filename*=UTF-8''${filename}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'", "Cross-Origin-Resource-Policy": "same-origin", "Accept-Ranges": "bytes", "Content-Length": String(bytes.length) });
    const range = request.headers.get("range");
    if (range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(range), start = match ? Number(match[1]) : -1, end = match?.[2] ? Number(match[2]) : bytes.length - 1;
      if (!match || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= bytes.length || end >= bytes.length) return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${bytes.length}`, "Cache-Control": "no-store" } });
      responseHeaders.set("Content-Range", `bytes ${start}-${end}/${bytes.length}`); responseHeaders.set("Content-Length", String(end - start + 1));
      return new NextResponse(new Uint8Array(bytes.subarray(start, end + 1)), { status: 206, headers: responseHeaders });
    }
    return new NextResponse(new Uint8Array(bytes), { headers: responseHeaders });
  } catch (error) { return failure(error); }
}
