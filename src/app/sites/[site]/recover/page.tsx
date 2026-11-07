import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requestPortal } from "@/server/portals/request";
import { StaffPasswordRecoveryForm } from "./form";

export const metadata: Metadata = { title: "Staff account recovery", robots: { index: false, follow: false } };
export default async function StaffPasswordRecoveryPage({ params, searchParams }: { params: Promise<{ site: string }>; searchParams: Promise<{ challenge?: string }> }) {
  const { site, paths } = await requestPortal((await params).site);
  if (site.id !== "skillcity" && site.id !== "labs") notFound();
  const query = await searchParams;
  const challengeId = typeof query.challenge === "string" && /^[0-9a-f-]{36}$/i.test(query.challenge) ? query.challenge : undefined;
  return <main className={`portal-login portal-${site.theme}`}><Link className="portal-wordmark" href={paths.home}>{site.name}<span>STAFF ACCOUNT RECOVERY</span></Link><StaffPasswordRecoveryForm site={site.id} login={paths.login} challengeId={challengeId}/></main>;
}
