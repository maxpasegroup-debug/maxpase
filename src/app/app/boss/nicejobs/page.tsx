import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/server/auth/guards";
import { AccessError } from "@/server/authorization/engine";
import { bossService } from "@/server/group/boss-service";
import { BossWorkspace } from "@/app/app/nicejobs/boss-workspace";

export default async function BossNiceJobsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireSession();
  try { await bossService.authority(session.userId); }
  catch (error) { if (error instanceof AccessError) notFound(); throw error; }
  const query = await searchParams;
  return <main className="boss-view">
    <nav className="boss-command-breadcrumb" aria-label="Breadcrumb"><Link href="/app/boss?view=companies">MAXPASE Boss</Link><span>/</span><Link href="/app/boss/command/aira-skill-city/aira-career-hub">AIRA Career Hub</Link><span>/</span><strong>Nice Jobs</strong></nav>
    <BossWorkspace userId={session.userId} realm="corporate" base="/app/boss/nicejobs" query={{ ...query, view: typeof query.view === "string" ? query.view : "workforce-command" }} />
  </main>;
}
