import { notFound } from "next/navigation";
import { requestPortal } from "@/server/portals/request";
import { JobsEmailAuthForm } from "../email-auth-form";

export const metadata = { title: "Existing account recovery | Nice Jobs", robots: { index: false, follow: false } };
export default async function LegacyRecovery({ params }: { params: Promise<{ site: string }> }) {
  const { site, paths } = await requestPortal((await params).site);
  if (site.id !== "jobs") notFound();
  return <JobsEmailAuthForm paths={paths} reset />;
}
