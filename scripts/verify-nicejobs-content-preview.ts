import { readFileSync, realpathSync } from "node:fs";
import { resolve, join, relative, isAbsolute, sep } from "node:path";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

async function main() {
  const directory = realpathSync(resolve(process.argv[2] ?? ""));
  const base = realpathSync(resolve(".private/content-preview"));
  const distance = relative(base, directory);
  assert(distance && !distance.startsWith(".." + sep) && distance !== ".." && !isAbsolute(distance), "Only a generated isolated preview is permitted");
  const runtime = JSON.parse(readFileSync(join(directory, "runtime.json"), "utf8"));
  assert.equal(runtime.purpose, "NICEJOBS_CONTENT_PREVIEW_ONLY");
  assert.equal(runtime.DATABASE_URL, "file:" + join(directory, "preview.db").replaceAll("\\", "/"));
  assert.equal(runtime.NICEJOBS_CONTENT_DIR, join(directory, "objects"));
  assert.equal(runtime.APP_ORIGIN, "http://127.0.0.1:3009");
  assert.equal(runtime.AUTH_COOKIE_NAME, "maxpase_content_preview");
  for (const key of ["DATABASE_URL", "NICEJOBS_CONTENT_DIR", "AUTH_SECRET", "AUTH_COOKIE_NAME", "AUTH_COOKIE_SECURE", "APP_ORIGIN"]) process.env[key] = runtime[key];
  const { createAuthenticationService } = await import("@/server/auth/service");
  const { createKnowledgeService } = await import("@/server/nicejobs/knowledge");
  const { privateContentStorage } = await import("@/server/nicejobs/content-storage");
  const { unavailableAttachments } = await import("@/server/communications/providers");
  const db = new PrismaClient({ datasourceUrl: runtime.DATABASE_URL });
  const sessions: { token: string; secret: string }[] = [];
  const auth = createAuthenticationService(db);
  const request = (path: string, init: RequestInit = {}) => fetch(runtime.APP_ORIGIN + path, { ...init, signal: AbortSignal.timeout(120000), redirect: "manual" });
  try {
    const credentials = JSON.parse(readFileSync(join(directory, "preview-accounts.json"), "utf8")) as { purpose: string; email: string; password: string }[];
    const account = credentials.find(a => a.purpose === "author");
    assert(account && account.email === "author@content-preview.invalid");
    const login = await auth.login({ email: account.email, password: account.password }, runtime.AUTH_SECRET);
    assert(login, "Synthetic author authentication failed");
    sessions.push({ token: login.token, secret: runtime.AUTH_SECRET });
    const headers = { Cookie: runtime.AUTH_COOKIE_NAME + "=" + login.token, Origin: runtime.APP_ORIGIN };
    assert.equal((await request("/staff/login")).status, 200);
    const workspace = await request("/app/nicejobs?view=content-management&kind=RESOURCE", { headers });
    assert.equal(workspace.status, 200);
    assert.match(await workspace.text(), /Content Management/, "Authorized content workspace did not render");
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jX1sAAAAASUVORK5CYII=", "base64");
    const organization = await db.organization.findUniqueOrThrow({ where: { slug: "aira-labs" } });
    const uploadHeaders = { ...headers, "Content-Type": "image/png", "x-organization-id": organization.id, "x-upload-key": crypto.randomUUID(), "x-file-name": "Synthetic-preview.png" };
    assert.equal((await request("/api/nicejobs/content/upload", { method: "POST", headers: { Origin: runtime.APP_ORIGIN }, body: png })).status, 401);
    const upload = await request("/api/nicejobs/content/upload", { method: "POST", headers: uploadHeaders, body: png });
    assert.equal(upload.status, 200, "Authenticated upload did not succeed");
    const file = await upload.json() as { id: string; filename: string };
    const replay = await request("/api/nicejobs/content/upload", { method: "POST", headers: uploadHeaders, body: png });
    assert.equal(replay.status, 200); assert.equal((await replay.json()).id, file.id);
    const service = createKnowledgeService(db, () => new Date(), unavailableAttachments, privateContentStorage(runtime.NICEJOBS_CONTENT_DIR));
    const resource = await service.mutate(login.session.userId, { operation: "CREATE", confirmed: true, idempotencyKey: crypto.randomUUID(), kind: "RESOURCE", payload: { title: "ISOLATED synthetic upload preview", summary: "Local HTTP test; never real training", captions: "One-pixel synthetic test image", audience: "DIVISION", organizationId: organization.id, resourceType: "IMAGE", privateReference: file.id } });
    const path = "/api/nicejobs/content/" + resource.id + "?management=true&preview=true";
    assert.equal((await request(path)).status, 401);
    const download = await request(path, { headers });
    assert.equal(download.status, 200); assert.equal(download.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), png);
    const range = await request(path, { headers: { ...headers, Range: "bytes=0-7" } });
    assert.equal(range.status, 206); assert.deepEqual(Buffer.from(await range.arrayBuffer()), png.subarray(0, 8));
    const denied = await request(path.replace("management=true", "management=false"), { headers });
    assert.equal(denied.status, 403);
    console.log("PASS: isolated HTTP staff login page, authenticated workspace, real upload/replay, guarded download, byte range and unauthorized/nonactivated denials. Synthetic content remains DRAFT; no real job, offer, worker, provider or financial mutation.");
  } finally {
    for (const session of sessions) await auth.revoke(session.token, session.secret);
    await db.$disconnect();
  }
}
void main().catch(error => { console.error(error instanceof Error ? error.message : "Isolated preview verification failed"); process.exitCode = 1; });
