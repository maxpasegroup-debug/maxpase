import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const configuration = z.object({
  CLOUDINARY_CLOUD_NAME: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  CLOUDINARY_API_KEY: z.string().min(4),
  CLOUDINARY_API_SECRET: z.string().min(10)
});
export class HrStorageUnavailable extends Error {}
const uploadResult = z.object({ asset_id: z.string().min(1), public_id: z.string().min(1), resource_type: z.enum(["image", "raw"]), format: z.string().min(1), bytes: z.number().int().positive(), type: z.literal("authenticated"), version: z.number().int().positive(), signature: z.string().regex(/^[a-f0-9]{40}$/) });
const signature = (params: Record<string, string>, secret: string) => createHash("sha1").update(Object.entries(params).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join("&") + secret).digest("hex");

export function hrCloudinary(env: Record<string, string | undefined> = process.env, transport: typeof fetch = fetch) {
  const configured = () => configuration.safeParse(env).success;
  const config = () => {
    const parsed = configuration.safeParse(env);
    if (!parsed.success) throw new HrStorageUnavailable("Private document storage is not configured");
    return parsed.data;
  };
  return {
    configured,
    async upload(publicId: string, bytes: Uint8Array, filename: string, mime: string) {
      const cfg = config();
      if (!/^maxpase\/hr\/[a-f0-9-]{36}$/.test(publicId)) throw new HrStorageUnavailable("Invalid storage key");
      const form = new FormData();
      form.set("file", new File([new Uint8Array(bytes)], filename, { type: mime }));
      form.set("public_id", publicId);
      form.set("type", "authenticated");
      form.set("overwrite", "false");
      const response = await transport(`https://api.cloudinary.com/v1_1/${cfg.CLOUDINARY_CLOUD_NAME}/auto/upload`, { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${cfg.CLOUDINARY_API_KEY}:${cfg.CLOUDINARY_API_SECRET}`).toString("base64")}` }, body: form, redirect: "error", signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new HrStorageUnavailable("Private document upload failed");
      const result = uploadResult.safeParse(await response.json());
      if (!result.success || result.data.public_id !== publicId || result.data.bytes !== bytes.length) throw new HrStorageUnavailable("Storage response could not be verified");
      const expected = signature({ public_id: publicId, version: String(result.data.version) }, cfg.CLOUDINARY_API_SECRET);
      const actual = Buffer.from(result.data.signature, "hex"), signed = Buffer.from(expected, "hex");
      if (actual.length !== signed.length || !timingSafeEqual(actual, signed)) throw new HrStorageUnavailable("Storage response could not be verified");
      return { assetId: result.data.asset_id, publicId, resourceType: result.data.resource_type, format: result.data.format, bytes: result.data.bytes };
    },
    async download(assetId: string, expectedBytes: number) {
      const cfg = config();
      if (!/^[a-zA-Z0-9_-]{6,120}$/.test(assetId) || expectedBytes < 1 || expectedBytes > 10 * 1024 * 1024) throw new HrStorageUnavailable("Document unavailable");
      const timestamp = String(Math.floor(Date.now() / 1000));
      const params = { asset_id: assetId, expires_at: String(Number(timestamp) + 60), timestamp };
      const query = new URLSearchParams({ ...params, api_key: cfg.CLOUDINARY_API_KEY, signature: signature(params, cfg.CLOUDINARY_API_SECRET) });
      const response = await transport(`https://api.cloudinary.com/v1_1/${cfg.CLOUDINARY_CLOUD_NAME}/asset/download?${query}`, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (!response.ok || !response.body) throw new HrStorageUnavailable("Document download unavailable");
      const reader = response.body.getReader(), chunks: Uint8Array[] = []; let total = 0;
      try {
        for (;;) { const item = await reader.read(); if (item.done) break; total += item.value.byteLength; if (total > expectedBytes) throw new HrStorageUnavailable("Storage payload differs from record"); chunks.push(item.value); }
      } finally { await reader.cancel(); reader.releaseLock(); }
      if (total !== expectedBytes) throw new HrStorageUnavailable("Storage payload differs from record");
      return Buffer.concat(chunks);
    }
  };
}
