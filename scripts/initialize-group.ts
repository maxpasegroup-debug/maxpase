import { PrismaClient } from "@prisma/client";
import { existsSync } from "node:fs";
import { validateRuntimeEnvironment } from "../src/server/config";
import { initializeGroupStructure } from "../src/server/group/structure";
if (existsSync(".env")) process.loadEnvFile(".env");
validateRuntimeEnvironment();
const db = new PrismaClient();
db.$transaction(initializeGroupStructure).then(() => console.log("Group structure initialized; no credentials, ownership or providers created.")).catch(() => { console.error("Group initialization failed; changes rolled back."); process.exitCode = 1; }).finally(() => db.$disconnect());
