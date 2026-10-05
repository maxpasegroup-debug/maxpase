import type { Prisma } from "@prisma/client";
import { AccessError } from "@/server/authorization/engine";
export const airaDivisions = [
  { name: "AIRA Startup School", slug: "aira-startup-school" },
  { name: "AIRA Labs", slug: "aira-labs" },
  { name: "AIRA Skill Studio", slug: "aira-skill-studio" },
  { name: "AIRA Career Hub", slug: "aira-career-hub" }
] as const;
export async function companyForOrganization(db: Prisma.TransactionClient, organizationId: string) {
  let id: string | null = organizationId;
  const visited = new Set<string>();
  while (id) {
    if (visited.has(id)) throw new AccessError("Invalid company hierarchy");
    visited.add(id);
    const node: { id: string; parentId: string | null; type: string; status: string } | null = await db.organization.findUnique({ where: { id }, select: { id: true, parentId: true, type: true, status: true } });
    if (!node || node.status !== "ACTIVE") throw new AccessError("Company context unavailable");
    if (node.type === "COMPANY") return node.id;
    id = node.parentId;
  }
  throw new AccessError("Company context unavailable");
}
export async function validateProductDivision(db: Prisma.TransactionClient, companyId: string, divisionId?: string | null) {
  if (!divisionId) return;
  const division = await db.organization.findUnique({ where: { id: divisionId } });
  if (!division || !["DIVISION", "BUSINESS_UNIT"].includes(division.type) || await companyForOrganization(db, divisionId) !== companyId) throw new AccessError("Product division belongs to another company");
}
export function protectCanonicalDivision(previous: { slug: string; name: string }, next: { name: string; slug: string }) {
  const canonical = airaDivisions.find(d => d.slug === previous.slug);
  if (canonical && (next.name !== canonical.name || next.slug !== canonical.slug)) throw new AccessError("Canonical AIRA division names and references are protected");
}
