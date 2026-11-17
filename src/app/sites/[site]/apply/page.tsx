import { notFound } from "next/navigation";
import { requestPortal } from "@/server/portals/request";
import { PublicStartupApplication } from "../../startup-ui/public-application";
import { startupAdmissionIntakes } from "@/server/group/startup-admission-intakes";

export default async function PublicApplyPage({ params }: { params: Promise<{ site: string }> }) {
  const { site, paths } = await requestPortal((await params).site);
  if (site.id !== "startup") notFound();
  try {
    const availability = await startupAdmissionIntakes.publicAvailability();
    return <PublicStartupApplication home={paths.home} availability={availability.programs} />;
  } catch (error) {
    // A local UI preview must remain renderable without a configured database.
    // Production still fails closed so intake availability is never guessed.
    if (process.env.NODE_ENV === "production") throw error;
    return <PublicStartupApplication home={paths.home} availability={[]} previewMode />;
  }
}
