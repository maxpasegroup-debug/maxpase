import { requestPortal } from "@/server/portals/request";
import { StaffActivationForm } from "./form";

export default async function StaffActivate({ params, searchParams }: { params: Promise<{ site: string }>; searchParams: Promise<{ challenge?: string }> }) {
  const id = (await params).site;
  if (id !== "skillcity" && id !== "labs") throw new Error("Employee activation unavailable");
  const { site, paths } = await requestPortal(id);
  const { challenge } = await searchParams;
  return <main className={`portal-workspace portal-${site.theme}`}><section className="business-empty"><p className="eyebrow">{site.name}</p><h1>Activate your employee account</h1><p>Use the code sent to your verified work email.</p><StaffActivationForm challengeId={typeof challenge === "string" ? challenge : ""} login={paths.login} site={id}/></section></main>;
}
