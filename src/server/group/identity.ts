export const groupIdentity = { name: "MAXPASE GROUP", product: "MAXPASE OS", domain: "maxpase.com", slug: "maxpase-group" } as const;
export const BOSS_EMAIL = "boss@maxpase.com";
export type BossConfiguration = { [key: string]: string | undefined; BOSS_EMAIL?: string; BOSS_PIN?: string };
export function validateBossConfiguration(env: BossConfiguration = process.env) {
  if (env.BOSS_EMAIL && env.BOSS_EMAIL !== BOSS_EMAIL) throw new Error("Boss email configuration is invalid");
  if (env.BOSS_PIN !== undefined && !/^[0-9]{6}$/.test(env.BOSS_PIN)) throw new Error("Boss PIN must contain exactly six numeric digits");
}
