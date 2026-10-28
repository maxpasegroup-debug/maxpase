import { notFound } from "next/navigation";
import { requestPortal } from "@/server/portals/request";
import { ApplicantPhoneSignupForm } from "./phone-form";
import { StartupSignupForm } from "../../startup-ui/signup-form";

export async function generateMetadata({ params }: { params: Promise<{ site: string }> }) { const { site } = await requestPortal((await params).site); return { title: site.id === "startup" ? "Begin your journey | AIRA Startup Skool" : "Create applicant account | Nice Jobs", robots: { index: false, follow: false } }; }
export default async function ApplicantSignup({ params, searchParams }: { params: Promise<{ site: string }>; searchParams: Promise<{ versionId?: string }> }) {
  const { site, paths } = await requestPortal((await params).site);
  if (site.id === "startup") return <StartupSignupForm home={paths.home} login={paths.login}/>;
  if (site.id !== "jobs") notFound();
  const query = await searchParams;
  const versionId = typeof query.versionId === "string" && /^[a-zA-Z0-9_-]{1,200}$/.test(query.versionId) ? query.versionId : undefined;
  void versionId;
  return <ApplicantPhoneSignupForm paths={paths} />;
}
