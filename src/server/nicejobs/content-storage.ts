import { mkdir, lstat, realpath, writeFile, readFile, unlink } from "node:fs/promises";
import { isAbsolute, resolve, relative, parse, sep } from "node:path";
import { z } from "zod";

export class ContentStorageUnavailable extends Error {}
export function privateContentStorage(directory = process.env.NICEJOBS_CONTENT_DIR ?? (process.env.NODE_ENV === "production" ? "" : resolve(".private/nicejobs-content"))) {
  async function root() {
    if (!directory || !isAbsolute(directory)) throw new ContentStorageUnavailable("Private content storage is not configured");
    const location = resolve(directory), cwd = resolve(".");
    const inside = (parent: string, child: string) => { const p = relative(parent, child); return !p || !p.startsWith(".." + sep) && p !== ".." && !isAbsolute(p); };
    if (location === parse(location).root || inside(cwd, location) && !inside(resolve(".private"), location)) throw new ContentStorageUnavailable("Storage must be outside public/application paths");
    await mkdir(location, { recursive: true, mode: 0o700 });
    const stat = await lstat(location);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (await realpath(location)).toLowerCase() !== location.toLowerCase()) throw new ContentStorageUnavailable("Private storage path is invalid");
    return location;
  }
  async function path(id: string) { z.string().uuid().parse(id); return resolve(await root(), id + ".blob"); }
  return {
    configured: !!directory && isAbsolute(directory),
    async write(id: string, bytes: Uint8Array) { await writeFile(await path(id), bytes, { flag: "wx", mode: 0o600 }); },
    async read(id: string) { const file = await path(id), stat = await lstat(file); if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024 * 1024) throw new ContentStorageUnavailable("File unavailable"); return readFile(file); },
    // Used only to roll back a newly-created, randomly-keyed object, never a referenced historical file.
    async rollback(id: string) { const file = await path(id); const stat = await lstat(file); if (!stat.isFile() || stat.isSymbolicLink()) throw new ContentStorageUnavailable("Rollback path invalid"); await unlink(file); },
    async available() { await root(); return true; }
  };
}
export type ContentStorage = ReturnType<typeof privateContentStorage>;
