import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/server/auth/guards";
import { AccessError } from "@/server/authorization/engine";
import { startupAdmissionsDesk } from "@/server/skillcity/startup-admissions-desk";
import { StartupAdmissionsWorkspace } from "@/app/sites/skillcity-ui/startup-admissions-workspace";

type Query = { view?: string; caseId?: string; program?: string; status?: string; district?: string; referral?: string; from?: string; to?: string; search?: string; page?: string; sort?: string; tasks?: string };
export default async function StartupLeadershipAdmissionsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Query> }) {
  const { id } = await params, query = await searchParams, session = await requireSession();
  let data: Awaited<ReturnType<typeof startupAdmissionsDesk.pageForBoss>>;
  try {
    data = await startupAdmissionsDesk.pageForBoss(session.userId, id, { caseId: query.caseId, program: query.program, status: query.status, district: query.district, referral: query.referral, from: query.from, to: query.to, search: query.search, page: Number(query.page ?? 1), sort: query.sort === "oldest" ? "oldest" : "newest", tasks: query.tasks });
  } catch (error) { if (error instanceof AccessError) notFound(); throw error; }
  const base = `/app/boss/brands/${encodeURIComponent(id)}/admissions/leadership`;
  return <><div style={{maxWidth:1600,margin:"0 auto",padding:"18px 24px 0"}}><Link href={`/app/boss/brands/${encodeURIComponent(id)}/admissions`}>← Back to admissions</Link><p style={{color:"#76656b",fontSize:13}}>This queue combines public SIA and legacy applications, while preserving each source and its history. Decisions require explicit Startup Skool access.</p><p><Link href={`/app/boss/brands/${encodeURIComponent(id)}/admissions/configuration`}>Configure PBA programs and intake →</Link> · <Link href={`/app/boss/brands/${encodeURIComponent(id)}/admissions/ao-assignments?view=assignments`}>Manage AO assignments →</Link></p></div><StartupAdmissionsWorkspace data={JSON.parse(JSON.stringify(data))} base={base} view={query.view ?? "overview"} bossBrandId={id}/></>;
}
