import { PrismaClient } from "@prisma/client";
import { existsSync } from "node:fs";
import { validateRuntimeEnvironment } from "../src/server/config";
import { provisionBoss } from "../src/server/group/provision";
if (existsSync(".env")) process.loadEnvFile(".env");
validateRuntimeEnvironment();
const db = new PrismaClient();
provisionBoss(db, process.env).then(() => console.log("Boss account provisioned; previous sessions revoked. No credential is displayed.")).catch(() => { console.error("Boss provisioning failed; check private configuration and existing authority. Changes rolled back."); process.exitCode = 1; }).finally(() => { delete process.env.BOSS_PIN; return db.$disconnect(); });
