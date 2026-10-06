import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/session";
export default async function BossEntry() { redirect(await getSession() ? "/app/boss" : "/boss/login"); }
