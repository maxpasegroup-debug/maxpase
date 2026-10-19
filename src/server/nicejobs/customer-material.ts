export function customerMaterial(v: { resourceType: string | null; status: string; current: boolean; visibility: string; reviewedAt: Date | null; publishedAt: Date | null; expiresAt: Date | null; title: string; body: string | null; url: string | null; privateReference: string | null }, now: Date) {
  if (v.resourceType !== "CUSTOMER_MATERIAL" || v.status !== "PUBLISHED" || !v.current || v.visibility !== "WORKER" || !v.reviewedAt || !v.publishedAt || v.expiresAt && v.expiresAt <= now || v.privateReference) return null;
  if (v.url) {
    try { const u = new URL(v.url); if (u.protocol !== "https:" || u.username || u.password) return null; } catch { return null; }
  }
  return v.body || v.url ? { title: v.title, text: v.body ?? "", url: v.url } : null;
}
