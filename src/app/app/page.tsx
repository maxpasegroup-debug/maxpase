import { redirect } from "next/navigation";
import { requireSession } from "@/server/auth/guards";
import { BOSS_EMAIL } from "@/server/group/identity";
export default async function AppPage() { const session = await requireSession(); redirect(session.email === BOSS_EMAIL ? "/app/boss" : "/app/executive"); }
