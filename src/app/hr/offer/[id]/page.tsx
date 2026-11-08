import { notFound } from "next/navigation";
import { hrRecruitmentService } from "@/server/group/hr-recruitment";
import { HrOfferResponse } from "./response";

export const dynamic = "force-dynamic";
export default async function HrOfferPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ token?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!query.token || query.token.length > 100) notFound();
  const offer = await hrRecruitmentService.publicOffer(id, query.token);
  if (!offer) notFound();
  return <HrOfferResponse offer={{ ...offer, token: query.token }}/>;
}
