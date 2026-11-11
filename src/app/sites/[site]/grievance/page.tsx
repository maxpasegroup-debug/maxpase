import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requestPortal } from "@/server/portals/request";
import { AiraPublicLegalPage } from "../../skillcity-ui/public-legal-page";

export async function generateMetadata({ params }: { params: Promise<{ site: string }> }): Promise<Metadata> {
  const { site } = await requestPortal((await params).site);
  if (site.id !== "skillcity") notFound();
  return { title: "Grievance Redressal | AIRA Skill City", description: "How to submit a service, payment or privacy grievance to AIRA Skill City." };
}

export default async function Grievance({ params }: { params: Promise<{ site: string }> }) {
  const { site, paths } = await requestPortal((await params).site);
  if (site.id !== "skillcity") notFound();
  return <AiraPublicLegalPage kind="grievance" home={paths.home} />;
}
