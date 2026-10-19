import { requestPortal } from "@/server/portals/request";
import { StaffActivationForm } from "./form";

export default async function SkillCityActivate({ searchParams }: { searchParams: Promise<{ challenge?: string }> }) {
  const { paths } = await requestPortal("skillcity");
  const { challenge } = await searchParams;
  return <main className="portal-workspace portal-skillcity"><section className="business-empty"><p className="eyebrow">AIRA Skill City</p><h1>Activate your employee account</h1><p>Use the code sent to your verified work email.</p><StaffActivationForm challengeId={typeof challenge === "string" ? challenge : ""} login={paths.login}/></section></main>;
}
