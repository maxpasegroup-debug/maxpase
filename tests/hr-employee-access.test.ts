import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createHrDocuments } from "@/server/group/hr-documents";
import { hrCloudinary } from "@/server/group/hr-cloudinary";
import { AccessError } from "@/server/authorization/engine";

describe("employee document access", () => {
  it("never fetches a private HR file for the employee", async () => {
    const download = vi.fn();
    const client = { hrDocument: { findUnique: vi.fn().mockResolvedValue({ id: "doc", assetId: "asset123", status: "ACTIVE", employeeVisible: false }) } } as unknown as PrismaClient;
    const service = createHrDocuments(client, { ...hrCloudinary({}), download } as ReturnType<typeof hrCloudinary>);
    await expect(service.selfDownload("worker", "doc")).rejects.toBeInstanceOf(AccessError);
    expect(download).not.toHaveBeenCalled();
  });

  it("does not use a shared file when the signed-in person has no matching active employment", async () => {
    const download = vi.fn();
    const client = {
      hrDocument: { findUnique: vi.fn().mockResolvedValue({ id: "doc", assetId: "asset123", status: "ACTIVE", employeeVisible: true, employmentId: "employment", companyId: "company", brandId: null }) },
      user: { findUnique: vi.fn().mockResolvedValue({ personId: "other-person", status: "ACTIVE" }) },
      employment: { findFirst: vi.fn().mockResolvedValue(null) }
    } as unknown as PrismaClient;
    const service = createHrDocuments(client, { ...hrCloudinary({}), download } as ReturnType<typeof hrCloudinary>);
    await expect(service.selfDownload("worker", "doc")).rejects.toBeInstanceOf(AccessError);
    expect(download).not.toHaveBeenCalled();
  });
});
