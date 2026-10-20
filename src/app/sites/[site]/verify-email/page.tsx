import { notFound } from "next/navigation";
import { requestPortal } from "@/server/portals/request";
import { JobsResendVerificationForm } from "../verify-email-form";

export const metadata = { title: "Verify email | Nice Jobs", robots: { index: false, follow: false } };
export default async function VerifyEmail({ params }: { params: Promise<{ site: string }> }) {
  const { site, paths } = await requestPortal((await params).site);
  if (site.id !== "jobs") notFound();
  return <JobsResendVerificationForm paths={paths} />;
}
