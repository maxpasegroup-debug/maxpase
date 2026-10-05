export function validateActionOrigin(origin: string | null, host: string | null, configuredOrigin?: string) {
  if (!origin) throw new Error("Invalid request origin");
  try {
    const actual = new URL(origin);
    if (actual.origin !== origin || !["http:", "https:"].includes(actual.protocol)) throw new Error();
    const expected = configuredOrigin ? new URL(configuredOrigin).origin : host ? new URL("http://" + host).host : null;
    if (configuredOrigin ? actual.origin !== expected : actual.host !== expected) throw new Error();
  } catch { throw new Error("Invalid request origin"); }
}
