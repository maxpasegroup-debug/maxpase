import { requireSession } from "@/server/auth/guards";
import { StartupCommercialWorkspace } from "@/components/startup-commercial-workspace";
export default async function BossStartupCommercial({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession(), { id } = await params;
  return <StartupCommercialWorkspace userId={session.userId} brandId={id} mode="BOSS" home={`/app/boss/brands/${encodeURIComponent(id)}`}/>;
}
