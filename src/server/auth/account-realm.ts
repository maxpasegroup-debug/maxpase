export function accountPortalRealm(metadata: string | null | undefined): "jobs" | "labs" | null {
  if (!metadata) return null;
  try { const realm = JSON.parse(metadata).authenticationRealm; return realm === "jobs" || realm === "labs" ? realm : null; }
  catch { throw new Error("Account configuration unavailable"); }
}
