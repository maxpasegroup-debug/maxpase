import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { resolveCrmContact } from "@/server/skillcity/contact-identity";

describe("shared AIRA CRM identity", () => {
  it("uses one company-scoped identity across product pipelines without storing contact details", async () => {
    const identities = new Map<string, { id: string; kind: string; organizationId: string }>();
    const upsert = vi.fn(async ({ where, create }: { where: { sourceKey: string }; create: { organizationId: string; kind: string; payload: string; title: string } }) => {
      expect(create.payload).not.toMatch(/person@example\.com/i);
      expect(create.title).not.toMatch(/person@example\.com/i);
      const old = identities.get(where.sourceKey);
      if (old) return old;
      const row = { id: String(identities.size + 1), kind: create.kind, organizationId: create.organizationId };
      identities.set(where.sourceKey, row);
      return row;
    });
    const db = { executiveRecord: { upsert } } as unknown as Prisma.TransactionClient;
    const first = await resolveCrmContact(db, "aira-company", " Person@Example.com ", "owner-1");
    const second = await resolveCrmContact(db, "aira-company", "person@example.com", "owner-2");
    const otherCompany = await resolveCrmContact(db, "other-company", "person@example.com", "owner-3");
    expect(first).toBe(second);
    expect(otherCompany).not.toBe(first);
    expect(identities.size).toBe(2);
  });

  it("rejects a source-key collision with a different record type", async () => {
    const db = { executiveRecord: { upsert: vi.fn(async () => ({ id: "wrong", kind: "LABS_LEAD", organizationId: "aira-company" })) } } as unknown as Prisma.TransactionClient;
    await expect(resolveCrmContact(db, "aira-company", "person@example.com", "owner-1")).rejects.toThrow("CRM identity collision");
  });
});
