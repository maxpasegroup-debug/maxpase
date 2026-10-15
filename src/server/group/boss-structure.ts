import type { createBossService } from "./boss-service";

type BossData = Awaited<ReturnType<ReturnType<typeof createBossService>["dashboard"]>>;

export const bossStructure = [
  {
    slug: "aira-skill-city", legalName: "AIRA SKILL CITY PRIVATE LIMITED",
    divisions: [
      { slug: "aira-startup-school", label: "Startup Skool", product: "PBA", productSlug: "pba" },
      { slug: "aira-labs", label: "AIRA Labs", product: "BGOS", productSlug: "bgos" },
      { slug: "aira-skill-studio", label: "AIRA Skill Studio", product: "GenZ Builder", productSlug: "genz-builder" },
      { slug: "aira-career-hub", label: "AIRA Career Hub", product: "Nice Jobs", productSlug: "nice-jobs" }
    ],
    brands: ["OnSpeak Mentor Hub", "HappiNotes", "Lifeskool", "The Skool Of Joy", "Pocket Doctor", "Queen's Club"]
  },
  { slug: "pearn", legalName: "TEARN PRIVATE LIMITED", divisions: [], brands: [], products: ["TeachX Guru", "LearnX Guru"] },
  { slug: "top-rank-ai", legalName: "TOP RANK AI PRIVATE LIMITED", divisions: [], brands: [], products: ["Top Rank AI"] }
] as const;

type NamedRow = { id: string; organizationId: string; name: string; slug?: string; status?: string; lifecycle?: string; divisionId?: string | null };
function namedRow(rows: readonly unknown[], organizationId: string, name: string, slug?: string, divisionId?: string): NamedRow | undefined {
  return rows.find((value): value is NamedRow => {
    if (!value || typeof value !== "object") return false;
    const row = value as Partial<NamedRow>;
    return row.organizationId === organizationId && (!divisionId || row.divisionId === divisionId) && (slug && row.slug === slug || row.name?.toLowerCase() === name.toLowerCase());
  }) as NamedRow | undefined;
}

export function projectBossStructure(data: BossData) {
  return bossStructure.flatMap(spec => {
    const card = data.cards.find(item => item.organization.slug === spec.slug);
    if (!card) return [];
    const division = (slug: string) => card.divisions.find(item => "slug" in item && item.slug === slug) as { id: string; slug: string; name: string; status: string } | undefined;
    const products = "products" in spec ? spec.products.map(name => ({ name, row: namedRow(data.products, card.organizationId, name) })) : [];
    return [{
      organizationId: card.organizationId,
      slug: spec.slug,
      legalName: spec.legalName,
      recordedLegalName: card.legalName,
      displayName: card.displayName,
      status: card.status,
      health: card.health,
      evidence: card.evidence,
      primaryBrand: spec.slug === "aira-skill-city" ? namedRow(data.brands, card.organizationId, "Aira Skill City", "aira-skill-city") : undefined,
      divisions: spec.divisions.map(item => ({
        ...item,
        row: division(item.slug),
        productRow: division(item.slug) ? namedRow(data.products, card.organizationId, item.product, item.productSlug, division(item.slug)!.id) : undefined
      })),
      brands: spec.brands.map(name => ({ name, row: namedRow(data.brands, card.organizationId, name) })),
      products
    }];
  });
}
