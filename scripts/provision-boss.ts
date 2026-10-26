import { PrismaClient } from "@prisma/client";
import { existsSync } from "node:fs";
import { validateRuntimeEnvironment } from "../src/server/config";
import { provisionBoss } from "../src/server/group/provision";
import { bossProvisionDiagnostic, type BossProvisionStage } from "../src/server/group/provision-diagnostic";

async function main() {
  let db: PrismaClient | undefined;
  let stage: BossProvisionStage = "configuration";
  try {
    if (existsSync(".env")) process.loadEnvFile(".env");
    validateRuntimeEnvironment();
    db = new PrismaClient();
    stage = "provisioning";
    await provisionBoss(db, process.env);
    console.log("Boss account provisioned; previous sessions revoked. No credential is displayed.");
  } catch (error) {
    const { code, correlationId, schemaTarget } = bossProvisionDiagnostic(error, stage);
    console.error(`Boss provisioning failed code=${code} correlationId=${correlationId}${schemaTarget ? ` schemaTarget=${schemaTarget}` : ""}; transaction rolled back when started.`);
    process.exitCode = 1;
  } finally {
    delete process.env.BOSS_PIN;
    try {
      await db?.$disconnect();
    } catch (error) {
      const { code, correlationId } = bossProvisionDiagnostic(error, "provisioning");
      console.error(`Boss provisioning cleanup failed code=${code} correlationId=${correlationId}.`);
      process.exitCode = 1;
    }
  }
}

void main();
