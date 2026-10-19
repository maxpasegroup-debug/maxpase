export function accountPortalRealm(metadata: string | null | undefined): "jobs" | "labs" | "skillcity" | null {
  if (!metadata) return null;
  try { const realm = JSON.parse(metadata).authenticationRealm; return realm === "jobs" || realm === "labs" || realm === "skillcity" ? realm : null; }
  catch { throw new Error("Account configuration unavailable"); }
}
