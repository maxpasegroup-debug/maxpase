import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { hrCloudinary, HrStorageUnavailable } from "@/server/group/hr-cloudinary";

const env = { CLOUDINARY_CLOUD_NAME: "disposable-test", CLOUDINARY_API_KEY: "test-key", CLOUDINARY_API_SECRET: "test-secret-long" };
describe("private HR Cloudinary adapter", () => {
  it("fails closed when credentials are missing", async () => {
    const storage = hrCloudinary({});
    expect(storage.configured()).toBe(false);
    await expect(storage.download("asset123", 4)).rejects.toBeInstanceOf(HrStorageUnavailable);
  });
  it("uploads as authenticated and rejects an unsigned provider response", async () => {
    const publicId = "maxpase/hr/123e4567-e89b-42d3-a456-426614174000";
    const sig = createHash("sha1").update(`public_id=${publicId}&version=123${env.CLOUDINARY_API_SECRET}`).digest("hex");
    const transport = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe("https://api.cloudinary.com/v1_1/disposable-test/auto/upload");
      expect(init.body).toBeInstanceOf(FormData);
      expect((init.body as FormData).get("type")).toBe("authenticated");
      expect((init.body as FormData).get("overwrite")).toBe("false");
      return Response.json({ asset_id: "asset123", public_id: publicId, resource_type: "image", format: "png", bytes: 4, type: "authenticated", version: 123, signature: sig });
    });
    const storage = hrCloudinary(env, transport as typeof fetch);
    await expect(storage.upload(publicId, new Uint8Array(4), "test.png", "image/png")).resolves.toMatchObject({ assetId: "asset123", bytes: 4 });
    transport.mockImplementationOnce(async () => Response.json({ asset_id: "asset123", public_id: publicId, resource_type: "image", format: "png", bytes: 4, type: "authenticated", version: 123, signature: "0".repeat(40) }));
    await expect(storage.upload(publicId, new Uint8Array(4), "test.png", "image/png")).rejects.toBeInstanceOf(HrStorageUnavailable);
  });
  it("uses a bounded signed asset download and rejects a length mismatch", async () => {
    const transport = vi.fn(async (url: string) => {
      const request = new URL(url);
      expect(request.pathname).toBe("/v1_1/disposable-test/asset/download");
      expect(request.searchParams.get("asset_id")).toBe("asset123");
      expect(request.searchParams.get("signature")).toMatch(/^[a-f0-9]{40}$/);
      return new Response(new Uint8Array([1,2,3]));
    });
    const storage = hrCloudinary(env, transport as typeof fetch);
    await expect(storage.download("asset123", 3)).resolves.toEqual(Buffer.from([1,2,3]));
    await expect(storage.download("asset123", 2)).rejects.toBeInstanceOf(HrStorageUnavailable);
  });
});
