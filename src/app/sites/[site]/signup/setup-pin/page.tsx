import { notFound, redirect } from "next/navigation";
import { requestPortal } from "@/server/portals/request";
import { getPortalSession } from "@/server/portals/session";
import { SetupPinForm } from "./setup-pin-form";
import { prisma } from "@/server/db";
import { jobsPinNextPath } from "@/lib/jobs-pin-navigation";

export const metadata = { title: "Set your PIN | Nice Jobs", robots: { index: false, follow: false } };

export default async function SetupPin({ params }: { params: Promise<{ site: string }> }) {
  const { site, paths } = await requestPortal((await params).site);
  if (site.id !== "jobs") notFound();
  const session = await getPortalSession(site, true);
  if (!session) redirect(paths.login.replace(/\/login$/, "/verify-email"));
  if (!session.needsJobsPinActivation) redirect(paths.gateway);
  const candidate = await prisma.user.findUnique({ where: { id: session.userId }, select: { jobsPhone: true } });
  if (!candidate?.jobsPhone) redirect(jobsPinNextPath(paths.login, null));
  return <SetupPinForm paths={paths} />;
}
