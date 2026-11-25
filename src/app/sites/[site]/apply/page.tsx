import { notFound } from "next/navigation";
import { requestPortal } from "@/server/portals/request";
import { StartupApplicationPage } from "../../startup-ui/startup-application";

export default async function PublicApplyPage({ params }: { params: Promise<{ site: string }> }) {
  const { site, paths } = await requestPortal((await params).site);
  if (site.id !== "startup") notFound();
  return <StartupApplicationPage home={paths.home} login={paths.login} />;
}
