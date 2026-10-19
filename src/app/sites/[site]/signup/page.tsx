import { notFound } from "next/navigation";
import { requestPortal } from "@/server/portals/request";
import { ApplicantSignupForm } from "./form";

export const metadata = { title: "Create applicant account | Nice Jobs", robots: { index: false, follow: false } };
export default async function ApplicantSignup({ params, searchParams }: { params: Promise<{ site: string }>; searchParams: Promise<{ versionId?: string }> }) {
  const { site, paths } = await requestPortal((await params).site);
  if (site.id !== "jobs") notFound();
  const query = await searchParams;
  const versionId = typeof query.versionId === "string" && /^[a-zA-Z0-9_-]{1,200}$/.test(query.versionId) ? query.versionId : undefined;
  return <ApplicantSignupForm paths={paths} versionId={versionId} />;
}
