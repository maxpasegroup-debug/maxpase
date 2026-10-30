import { requireSession } from "@/server/auth/guards";
import { MarketingWorkspace } from "@/components/marketing-workspace";
export default async function BossBrandMarketing({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ search?: string; status?: string; recordId?: string }> }) {
  const session = await requireSession(), { id } = await params, query = await searchParams;
  const base = `/app/boss/brands/${encodeURIComponent(id)}/marketing`;
  return <MarketingWorkspace userId={session.userId} brandId={id} mode="BOSS" base={base} home={`/app/boss/brands/${encodeURIComponent(id)}`} {...query}/>;
}
