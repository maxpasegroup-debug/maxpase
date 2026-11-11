import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requestPortal } from "@/server/portals/request";
import { AiraPublicLegalPage } from "../../skillcity-ui/public-legal-page";

export async function generateMetadata({ params }: { params: Promise<{ site: string }> }): Promise<Metadata> {
  const { site } = await requestPortal((await params).site);
  if (site.id !== "skillcity") notFound();
  return { title: "Refund & Cancellation Policy | AIRA Skill City", description: "AIRA Skill City refund, cancellation and payment support information." };
}

export default async function RefundPolicy({ params }: { params: Promise<{ site: string }> }) {
  const { site, paths } = await requestPortal((await params).site);
  if (site.id !== "skillcity") notFound();
  return <AiraPublicLegalPage kind="refund-policy" home={paths.home} />;
}
