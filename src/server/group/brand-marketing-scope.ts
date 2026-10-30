export function marketingDivisionSlug(slug: string, parentSlug?: string) {
  const mapping: Record<string, string> = { "startup-school": "aira-startup-school", "aira-labs": "aira-labs", "aira-skill-studio": "aira-skill-studio", "aira-career-hub": "aira-career-hub", "nice-jobs": "aira-career-hub" };
  return mapping[slug] ?? (parentSlug ? mapping[parentSlug] : undefined);
}
