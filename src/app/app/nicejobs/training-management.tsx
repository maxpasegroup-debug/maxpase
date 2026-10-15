import Link from "next/link";
import type { createOnboardingService } from "@/server/nicejobs/onboarding";
import { OnboardingCommand } from "./onboarding-form";

type Detail=Awaited<ReturnType<ReturnType<typeof createOnboardingService>["detail"]>>;
export function TrainingManagement({detail:d,realm,own,command,href}:{detail:Detail;realm:string;own:boolean;command:(operation:string,extra?:Record<string,unknown>)=>Record<string,unknown>;href:(changes:Record<string,string|undefined>)=>string}){
  const date=(value:Date)=>new Intl.DateTimeFormat("en-IN",{timeZone:d.today.timezone,dateStyle:"medium",timeStyle:"short"}).format(value);
  return <section className="nj-training-management"><h2>Training control</h2>
    {d.control.paused && <p role="status">Training paused. The accepted calendar remains unchanged. An independently approved resume is required.</p>}
    <p>{d.control.pauseAllowed?"Reviewed pauses permitted":"Pause not permitted by this accepted programme"} / {d.control.extensionAllowed?"Reviewed deadline extensions permitted":"Deadline shifting not permitted"}</p>
    {!own && <><p>Waiting for evidence review: {d.today.counts.awaitingReview} / Overdue: {d.today.counts.overdue}</p>
      <h3>Recent evidence decisions</h3>{!d.managementReviews.length && <p>No evidence decisions recorded.</p>}<ul>{d.managementReviews.map(r=><li key={r.id}>{r.submission?.progress.key??r.kind} / {r.outcome.replaceAll("_"," ")} / {r.reviewer.person?.displayName??"Recorded reviewer"}<p>{date(r.reviewedAt)} / {r.submission?Math.max(0,Math.round((r.reviewedAt.getTime()-r.submission.submittedAt.getTime())/60000))+" minutes from submission to decision":"Turnaround unavailable"}</p>{r.feedback && <p>{r.feedback}</p>}</li>)}</ul><p>Latest 25 recorded evidence decisions; turnaround is measured time, not a promised SLA.</p>
    </>}
    <h3>Control requests and decisions</h3>{!d.control.proposals.length && <p>No control requests recorded.</p>}<ul>{d.control.proposals.map(p=><li key={p.id}><strong>{p.control.kind.replaceAll("_"," ")} / {p.status}</strong><p>Requested {date(p.requestedAt)}{p.decidedAt?" / Decided "+date(p.decidedAt):""}</p>{p.feedback && <p>{p.feedback}</p>}{p.control.kind==="EXTEND" && <p>Proposed deadline: {date(new Date(p.control.dueAt))}</p>}{p.control.kind==="PROGRAMME_CHANGE" && <p>Target version: {p.control.versionId}. Not applied: a reviewed offer, candidate acceptance and explicit enrollment are still required. No evidence is transferred automatically.</p>}
      {!own && d.permissions.controlDecide && p.status==="PENDING" && <OnboardingCommand realm={realm} own={false} command={command("DECIDE_CONTROL",{proposalId:p.id})} label="Decide training control" management controlDecision/>}
    </li>)}</ul>
    {!own && d.permissions.manage && ["ORIENTATION","OJT","NOT_READY"].includes(d.status) && !d.control.proposals.some(p=>p.status==="PENDING") && <details><summary>Propose a training intervention</summary>
      {d.control.pauseAllowed && <OnboardingCommand realm={realm} own={false} command={command("PROPOSE_CONTROL")} label={d.control.paused?"Request resume":"Request pause"} management trainingControl={d.control.paused?"RESUME":"PAUSE"}/>}
      {d.programmeVersions.length?<OnboardingCommand realm={realm} own={false} command={command("PROPOSE_CONTROL")} label="Request programme change review" management trainingControl="PROGRAMME_CHANGE" programmeVersions={d.programmeVersions}/>:<p>No approved replacement programme is available in your authorized job scope.</p>}
    </details>}
    {!own && d.permissions.manage && !["READY","CANCELLED"].includes(d.status) && <details><summary>Schedule an internal reminder</summary><OnboardingCommand realm={realm} own={false} command={command("SCHEDULE_REMINDER")} label="Schedule reminder" management reminder/><p>No automatic scheduler is running. A separately authorized operator must process due reminders. Nothing is sent externally.</p></details>}
    {!own && <><h3>Recorded reminder schedules</h3>{!d.scheduledReminders.length && <p>No schedules accessible with your reminder permissions.</p>}<ul>{d.scheduledReminders.map(r=><li key={r.id}>{r.status} / {date(r.remindAt)}<p>{r.reason}</p></li>)}</ul><p>Latest 20 authorized schedules. Pending is not delivered.</p>{d.status==="READY" && d.permissions.activate && <Link href={href({view:"activation",reference:undefined,queue:undefined,status:undefined,readinessStatus:undefined})}>Open separately authorized worker activation</Link>}</>}
  </section>;
}
