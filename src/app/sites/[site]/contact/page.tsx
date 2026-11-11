import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requestPortal } from "@/server/portals/request";
import { AiraPublicLegalPage } from "../../skillcity-ui/public-legal-page";

export async function generateMetadata({ params }: { params: Promise<{ site: string }> }): Promise<Metadata> {
  const { site } = await requestPortal((await params).site);
  if (site.id !== "skillcity") notFound();
  return { title: "Contact | AIRA Skill City", description: "Official contact details for AIRA Skill City company and programme enquiries." };
}

export default async function Contact({ params }: { params: Promise<{ site: string }> }) {
  const { site, paths } = await requestPortal((await params).site);
  if (site.id !== "skillcity") notFound();
  return <AiraPublicLegalPage kind="contact" home={paths.home} />;
}
