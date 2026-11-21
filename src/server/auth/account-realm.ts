export function accountPortalRealm(metadata: string | null | undefined): "jobs" | "labs" | "skillcity" | "startup" | "brand" | null {
  if (!metadata) return null;
  try { const realm = JSON.parse(metadata).authenticationRealm; return realm === "jobs" || realm === "labs" || realm === "skillcity" || realm === "startup" || realm === "brand" ? realm : null; }
  catch { throw new Error("Account configuration unavailable"); }
}
