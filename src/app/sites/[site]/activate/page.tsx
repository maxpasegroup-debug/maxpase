import { requestPortal } from "@/server/portals/request";
import { StaffActivationForm } from "./form";
import Link from "next/link";
import { SkillCityLogo } from "@/components/skillcity-logo";

export default async function StaffActivate({ params, searchParams }: { params: Promise<{ site: string }>; searchParams: Promise<{ challenge?: string }> }) {
  const id = (await params).site;
  if (id !== "skillcity" && id !== "labs") throw new Error("Employee activation unavailable");
  const { site, paths } = await requestPortal(id);
  const { challenge } = await searchParams;
  return <main className={`portal-workspace portal-${site.theme}`}>{id === "skillcity" && <header className="portal-header"><Link className="portal-wordmark" href={paths.home}><SkillCityLogo size={48} />{site.name}</Link></header>}<section className="business-empty"><p className="eyebrow">{site.name}</p><h1>Activate your employee account</h1><p>Use the code sent to your verified work email.</p><StaffActivationForm challengeId={typeof challenge === "string" ? challenge : ""} login={paths.login} site={id}/></section></main>;
}
