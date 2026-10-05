import { randomUUID } from "node:crypto";

export function safeDiagnostic(code: "authentication_failed" | "readiness_failed" | "operation_failed", correlationId = randomUUID()) {
  console.error(JSON.stringify({ level: "error", code, correlationId, timestamp: new Date().toISOString() }));
  return correlationId;
}
