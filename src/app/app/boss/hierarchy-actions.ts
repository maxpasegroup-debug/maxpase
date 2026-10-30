"use server";
import { revalidatePath } from "next/cache";
import { z, ZodError } from "zod";
import { requireSession } from "@/server/auth/guards";
import { AccessError } from "@/server/authorization/engine";
import { BusinessError, businessService } from "@/server/domain/business-service";
import { bossRegistry } from "@/server/group/boss-registry";
import { bossService } from "@/server/group/boss-service";
import { safeDiagnostic } from "@/server/security/diagnostics";

export type HierarchySaveState = { error?: string; success?: string };
const fields = z.object({
  kind: z.enum(["company", "brand"]), recordId: z.string().max(200).optional(), organizationId: z.string().max(200).optional(),
  parentBrandId: z.string().max(200).optional(), name: z.string().trim().min(1).max(200),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),
  legalName: z.string().trim().max(200).optional(), description: z.string().trim().max(4000).optional(),
  website: z.union([z.literal(""), z.url().refine(value => /^https?:\/\//.test(value))]).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("INACTIVE")
});
function field(form: FormData, name: string) { const value = form.get(name); return typeof value === "string" && value !== "" ? value : undefined; }
function json(value: string | null) { return value ? JSON.parse(value) as Record<string, unknown> : undefined; }

export async function saveBossHierarchyRecord(_previous: HierarchySaveState, form: FormData): Promise<HierarchySaveState> {
  const session = await requireSession();
  try {
    const data = fields.parse(Object.fromEntries(["kind", "recordId", "organizationId", "parentBrandId", "name", "slug", "legalName", "description", "website", "status"].map(key => [key, field(form, key)])));
    if (data.kind === "company") {
      const { ctx, root } = await bossService.authority(session.userId);
      if (data.recordId) {
        const organizationId = data.organizationId;
        if (!organizationId) throw new AccessError("Company unavailable");
        const { row } = await bossRegistry.company(session.userId, organizationId);
        if (row.id !== data.recordId) throw new AccessError("Company unavailable");
        await businessService.save(session.userId, "companies", {
          groupOrganizationId: root.id, name: data.name, slug: data.slug, legalName: data.legalName || null,
          description: data.description || null, status: data.status, shortName: row.shortName, companyType: row.companyType,
          country: row.country, region: row.region, identifiers: json(row.identifiers), metadata: json(row.metadata)
        }, row.id);
      } else {
        await ctx.requireAccess("company.manage", { organizationId: root.id });
        await businessService.save(session.userId, "companies", {
          groupOrganizationId: root.id, name: data.name, slug: data.slug, legalName: data.legalName || null,
          description: data.description || null, status: "INACTIVE"
        });
      }
    } else {
      if (!data.organizationId) throw new AccessError("Company unavailable");
      await bossRegistry.company(session.userId, data.organizationId);
      const existing = data.recordId ? await bossRegistry.brand(session.userId, data.recordId) : null;
      if (existing && existing.row.organizationId !== data.organizationId) throw new AccessError("Brand unavailable");
      const parentBrandId = existing ? existing.row.parentBrandId : data.parentBrandId;
      if (parentBrandId) {
        const parent = await bossRegistry.brand(session.userId, parentBrandId);
        if (parent.row.organizationId !== data.organizationId) throw new AccessError("Brand parent unavailable");
      }
      await businessService.save(session.userId, "brands", {
        organizationId: data.organizationId, parentBrandId: parentBrandId || null,
        name: data.name, slug: data.slug, description: data.description || null,
        website: data.website || null, status: existing ? data.status : "INACTIVE",
        metadata: existing ? json(existing.row.metadata) : undefined
      }, existing?.row.id);
    }
    revalidatePath("/app", "layout");
    return { success: "Saved. Refreshing the hierarchy." };
  } catch (error) {
    if (error instanceof ZodError) return { error: error.issues.map(issue => issue.message).join("; ") };
    if (error instanceof AccessError || error instanceof BusinessError) return { error: error.message };
    if (error instanceof SyntaxError) return { error: "Existing record metadata needs review before editing." };
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return { error: "That identity is already in use." };
    return { error: `Could not save this record. Reference: ${safeDiagnostic("operation_failed")}` };
  }
}
