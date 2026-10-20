import { notFound, redirect } from "next/navigation";
import { requestPortal } from "@/server/portals/request";
import { getPortalSession } from "@/server/portals/session";
import { prisma } from "@/server/db";
import { JobsEmailAuthForm } from "../email-auth-form";
import { JobsActivatePinForm } from "../activate-pin-form";

export const metadata = { title: "Activate phone sign-in | Nice Jobs", robots: { index: false, follow: false } };
export default async function ActivatePin({ params }: { params: Promise<{ site: string }> }) {
  const { site, paths } = await requestPortal((await params).site);
  if (site.id !== "jobs") notFound();
  const session = await getPortalSession(site, true);
  if (!session) return <JobsEmailAuthForm paths={paths} />;
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { jobsPinHash: true } });
  if (user?.jobsPinHash) redirect(paths.gateway);
  return <JobsActivatePinForm paths={paths} />;
}
