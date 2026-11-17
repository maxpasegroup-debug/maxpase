import { notFound, redirect } from "next/navigation";
import { requestPortal } from "@/server/portals/request";
import { getPortalSession } from "@/server/portals/session";
import { AccessError } from "@/server/authorization/engine";
import { startupAdmissionsDesk } from "@/server/skillcity/startup-admissions-desk";
import { StartupAdmissionsWorkspace } from "../../skillcity-ui/startup-admissions-workspace";

type Search = { view?: string; program?: string; from?: string; to?: string; status?: string; district?: string; referral?: string; search?: string; page?: string; sort?: string; caseId?: string; tasks?: string; notice?: string };
export default async function AdmissionsOfficePage({ params, searchParams }: { params: Promise<{ site: string }>; searchParams: Promise<Search> }) {
  const { site, paths } = await requestPortal((await params).site);
  if (site.id !== "skillcity") notFound();
  const session = await getPortalSession(site);
  if (!session) redirect(paths.login);
  const query = await searchParams;
  let data: Awaited<ReturnType<typeof startupAdmissionsDesk.page>>;
  try {
    data = await startupAdmissionsDesk.page(session.userId, { program: query.program, from: query.from, to: query.to, status: query.status, district: query.district, referral: query.referral, search: query.search, page: Number(query.page ?? 1), sort: query.sort === "oldest" ? "oldest" : "newest", caseId: query.caseId, tasks: query.tasks });
  } catch (error) { if (error instanceof AccessError) notFound(); throw error; }
  const base = paths.home.startsWith("/sites/") ? `${paths.home}/admissions` : "/admissions";
  return <StartupAdmissionsWorkspace data={JSON.parse(JSON.stringify(data))} base={base} view={query.view ?? "overview"} notice={query.notice}/>;
}
