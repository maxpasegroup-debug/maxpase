import Link from "next/link";
import { niceJobsService } from "@/server/nicejobs/service";
import { JobForm } from "./job-form";

const launchRoles: Record<string, string> = {
  "JOB-001": "Academic Advisor",
  "JOB-DCM": "Defence Career Mentor"
};

export async function BossJobSetup({ userId, base, realm }: { userId: string; base: string; realm: string }) {
  const [options, roles] = await Promise.all([niceJobsService.options(userId), niceJobsService.launchSetup(userId)]);
  const recorded = roles.filter(role => role.version);
  return <section className="nj-workspace" aria-labelledby="job-setup-heading">
    <header><p>Boss / Nice Jobs</p><h1 id="job-setup-heading">Set up launch jobs</h1><p>Complete each role in order. A draft is never shown as an open job.</p></header>
    <ol className="nj-setup-stages" aria-label="Job setup steps"><li>Employer and role</li><li>Terms and manager</li><li>Orientation</li><li>Training</li><li>Human review and publication</li></ol>
    {roles.map(({ code, version, setup }) => {
      const status = version?.publishedAt ? version.template.status : version?.status ?? "NOT CREATED";
      const issues = setup?.issues ?? ["Create the unpublished job draft."];
      const current = !!version?.publishedAt && version.template.publishedVersionId === version.id && version.template.status === "PUBLISHED" && setup?.ready;
      return <article className="nj-programme-checklist" key={code} aria-labelledby={`job-${code}`}>
        <header><h2 id={`job-${code}`}>{version?.title ?? launchRoles[code]}</h2><span className="nj-setup-status">{current ? "Open" : status.replaceAll("_", " ")}</span></header>
        <p>{code}{version ? ` · version ${version.number}` : " · no draft recorded"}</p>
        {version && setup && <p role="status">{setup.ready ? "Configuration complete; authorized review and publication are still required." : `${issues.length} setup requirements remain. This job cannot open.`}</p>}
        {issues.length > 0 && <><h3>What is missing</h3><ul>{issues.map((issue, index) => <li key={`${code}-${index}`}>{issue}</li>)}</ul></>}
        {version && <Link href={`${base}?view=templates&versionId=${encodeURIComponent(version.id)}&companyId=${encodeURIComponent(options.companyId)}`}>Configure and review this job</Link>}
      </article>;
    })}
    {recorded.length < 2 && options.canSeedLaunch && <JobForm realm={realm} operation="seed-launch" label={recorded.length ? "Create missing launch draft" : "Create the two launch drafts"} confirm />}
    <p>Other historical jobs remain in the job registry. They are outside this launch setup.</p>
  </section>;
}
