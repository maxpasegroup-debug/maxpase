import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

export type BossProvisionStage = "configuration" | "provisioning";

function knownSchemaTarget(error: unknown, prismaCode: string | undefined) {
  if ((prismaCode !== "P2021" && prismaCode !== "P2022") || !error || typeof error !== "object" || !("meta" in error)) return undefined;
  const meta = error.meta;
  if (!meta || typeof meta !== "object") return undefined;
  const raw = prismaCode === "P2021" ? "table" in meta ? meta.table : undefined : "column" in meta ? meta.column : undefined;
  if (typeof raw !== "string") return undefined;
  if (!/^(?:public\.)?[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?$/.test(raw)) return undefined;
  const parts = raw.split(".").filter(part => part !== "public");
  const model = Prisma.dmmf.datamodel.models.find(item => parts[0] === (item.dbName ?? item.name));
  if (!model) return undefined;
  const name = model.dbName ?? model.name;
  if (prismaCode === "P2021") return name;
  const field = model.fields.find(item => parts[1] === (item.dbName ?? item.name));
  return field ? `${name}.${field.dbName ?? field.name}` : undefined;
}

export function bossProvisionDiagnostic(error: unknown, stage: BossProvisionStage) {
  const prismaCode = error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : undefined;
  const code = stage === "configuration" ? "boss_configuration_invalid"
    : ["P2021", "P2022", "P1014"].includes(prismaCode ?? "") ? "database_schema_missing"
    : ["P1001", "P1002", "P1008", "P1017"].includes(prismaCode ?? "") ? "database_unreachable"
    : ["P1000", "P1010"].includes(prismaCode ?? "") ? "database_access_denied"
    : "boss_provisioning_failed";
  const schemaTarget = knownSchemaTarget(error, prismaCode);
  return { code, ...(prismaCode && /^P\d{4}$/.test(prismaCode) ? { prismaCode } : {}), correlationId: randomUUID(), ...(schemaTarget ? { schemaTarget } : {}) };
}
