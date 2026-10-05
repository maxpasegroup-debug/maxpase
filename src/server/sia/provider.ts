import { routeIntent } from "./registry";

export interface SiaProvider {
  readonly name: string;
  readonly model: string | null;
  selectIntent(message: string): Promise<{ toolKey: string | null; inputTokens: number | null; outputTokens: number | null; estimatedCost: number | null }>;
}
export const deterministicProvider: SiaProvider = Object.freeze({
  name: "DETERMINISTIC_DEVELOPMENT", model: null,
  async selectIntent(message: string) { return { toolKey: routeIntent(message), inputTokens: null, outputTokens: null, estimatedCost: null }; }
});
export function configuredProvider(): SiaProvider {
  if (process.env.SIA_PROVIDER && process.env.SIA_PROVIDER !== "deterministic") return { name: "UNAVAILABLE", model: null, async selectIntent() { throw new Error("MODEL_UNAVAILABLE"); } };
  return deterministicProvider;
}
