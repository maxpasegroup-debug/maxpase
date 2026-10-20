import { notFound } from "next/navigation";
import { requestPortal } from "@/server/portals/request";
import { JobsPhoneAuthForm } from "../phone-auth-form";

export const metadata = { title: "Reset PIN | Nice Jobs", robots: { index: false, follow: false } };
export default async function ResetPassword({ params }: { params: Promise<{ site: string }> }) {
  const { site, paths } = await requestPortal((await params).site);
  if (site.id !== "jobs") notFound();
  return <JobsPhoneAuthForm paths={paths} reset />;
}
