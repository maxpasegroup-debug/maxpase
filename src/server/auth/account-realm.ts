export function accountPortalRealm(metadata: string | null | undefined): "jobs" | "labs" | "skillcity" | "startup" | null {
  if (!metadata) return null;
  try { const realm = JSON.parse(metadata).authenticationRealm; return realm === "jobs" || realm === "labs" || realm === "skillcity" || realm === "startup" ? realm : null; }
  catch { throw new Error("Account configuration unavailable"); }
}
