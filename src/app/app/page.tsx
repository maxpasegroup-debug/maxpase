import { redirect } from "next/navigation";
import { requireSession } from "@/server/auth/guards";
import { BOSS_EMAIL } from "@/server/group/identity";
import { prisma } from "@/server/db";
import { brandWorkspacePath, brandWorkspaceSlug } from "@/server/group/brand-workspaces";
export default async function AppPage() {
  const session = await requireSession();
  if (session.email === BOSS_EMAIL) redirect("/app/boss");
  if (session.personId) {
    const memberships = await prisma.membership.findMany({ where: { personId: session.personId, status: "ACTIVE", organization: { type: "BUSINESS_UNIT", status: "ACTIVE", slug: { startsWith: "brand-workspace-" } }, roles: { some: { role: { status: "ACTIVE", principalType: "HUMAN", key: { in: ["brand-director", "brand-administrative-officer", "brand-specialist", "brand-employee"] } } } } }, select: { organization: { select: { slug: true, parentId: true, metadata: true } } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 20 });
    for (const membership of memberships) {
      const workspace = membership.organization, slug = workspace.slug.replace(/^brand-workspace-/, "");
      if (workspace.slug !== brandWorkspaceSlug(slug) || !workspace.parentId) continue;
      const brand = await prisma.brand.findFirst({ where: { slug, organizationId: workspace.parentId, status: "ACTIVE", organization: { status: "ACTIVE", company: { status: "ACTIVE" } } }, select: { id: true, slug: true } });
      let binding: { brandId?: string; brandSlug?: string; workspaceKind?: string } = {};
      try { binding = JSON.parse(workspace.metadata ?? "{}"); } catch { /* Invalid workspace binding cannot be used for a landing redirect. */ }
      if (brand && binding.brandId === brand.id && binding.brandSlug === brand.slug && binding.workspaceKind === "BRAND_DEFAULT") redirect(brandWorkspacePath(brand.slug));
    }
  }
  redirect("/app/executive");
}
