export type LandingOpportunity = { id: string; title: string; employer: string; areas: string[] };

export function opportunityPreview(availability: "ready" | "unavailable", opportunities: LandingOpportunity[]) {
  if (availability === "unavailable") return { state: "unavailable" as const, opportunities: [] };
  if (!opportunities.length) return { state: "empty" as const, opportunities: [] };
  return { state: "published" as const, opportunities };
}
