import { requireSession } from "@/server/auth/guards";
import { NiceJobsWorkspace } from "./workspace";
import { ApplicationWorkspace } from "./application-workspace";
import { OnboardingWorkspace } from "./onboarding-workspace";
export default async function NiceJobsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireSession();
  const query = await searchParams;
  const Workspace = ["my-onboarding", "onboarding", "my-reviews"].includes(String(query.view)) ? OnboardingWorkspace : ["opportunities", "my-applications", "applications"].includes(String(query.view)) ? ApplicationWorkspace : NiceJobsWorkspace;
  return <Workspace userId={session.userId} realm="corporate" base="/app/nicejobs" query={query} />;
}
