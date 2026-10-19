import Link from "next/link";
import type { onboardingService } from "@/server/nicejobs/onboarding";
import { OnboardingCommand } from "./onboarding-form";

type Detail=Awaited<ReturnType<typeof onboardingService.detail>>;
export function TrainingToday({detail:d,realm,href,command,own}:{detail:Detail;realm:string;href:(changes:Record<string,string|undefined>)=>string;command:(operation:string,extra?:Record<string,unknown>)=>Record<string,unknown>;own:boolean}){
  const current=d.dailyReports.find(r=>r.date===d.today.date)?.submissions[0];
  return <section className="nj-training-today" aria-labelledby="today-heading"><h2 id="today-heading">Today / {d.today.date}</h2><p>{d.title} / {d.today.timezone}{d.today.day?` / Day ${d.today.day}`:""}{d.today.stage?` / ${d.today.stage}`:""}</p>
    {d.today.nonWorkingDay && <p>No new scheduled working-day lesson today. Any overdue practice or reviewer feedback still appears below.</p>}
    {d.today.beforeStart && <p>The first configured working day has not opened yet.</p>}{d.today.scheduleEnded && <p>The scheduled training period has ended. Complete outstanding evidence and contact your reviewer; elapsed time does not complete training.</p>}
    <dl className="nj-training-counts">{[["Completed",d.today.counts.completed],["Open practice",d.today.counts.pending],["Awaiting review",d.today.counts.awaitingReview],["Overdue (including review waits)",d.today.counts.overdue],["Future activities",d.today.counts.future]].map(([label,count])=><div key={label}><dt>{label}</dt><dd>{count}</dd></div>)}</dl>
    <p>Approved/completed OJT {d.today.days.unit}: {d.today.days.completed} / {d.today.days.required}{!d.today.days.required&&" / Not configured"}</p>
    {d.nextRequirement?.status==="SUBMITTED" && <p role="status">Your next requirement is awaiting your reviewer's decision. Submission alone is not completion.</p>}
    {d.nextRequirement && <p><a href={d.progress.some(p=>p.id===d.nextRequirement!.id)?`#training-${d.nextRequirement.id}`:href({view:own?"my-onboarding":"onboarding",reference:d.reference,progressAfter:undefined})}>Next required action: {d.nextRequirement.title}</a></p>}
    <Link href={href({view:own?"my-onboarding":"onboarding",reference:d.reference,progressAfter:undefined})}>All training activities and history</Link>
    <h3>Upcoming milestones</h3>{!d.today.upcoming.length?<p>No upcoming configured milestones.</p>:<ul>{d.today.upcoming.map((m,i)=><li key={i}>{m.day?`Day ${m.day}: `:""}{m.title} / {m.stage}{m.date?` / ${m.date}`:""}</li>)}</ul>}
    <h3>Daily training report</h3><p>A report records your notes and actual progress snapshot; it does not approve evidence.</p>
    {own && !d.control?.paused && ["ORIENTATION","OJT","READINESS_REVIEW","NOT_READY"].includes(d.status) && (!current?<OnboardingCommand realm={realm} own command={command("DAILY_REPORT")} label="Submit daily training report" report={{date:d.today.date}}/>:<details><summary>Correct today's report</summary><OnboardingCommand realm={realm} own command={command("DAILY_REPORT")} label="Record report correction" report={{date:d.today.date,previousId:current.id}}/></details>)}
    {!d.dailyReports.length && <p>No daily training report recorded.</p>}
    {d.dailyReports.map(report=><details key={report.date} open={report.date===d.today.date}><summary>{report.date} / Recorded, not training approval</summary>{report.submissions.map(s=><div key={s.id}><p>Version {s.attempt} / {new Intl.DateTimeFormat("en-IN",{timeZone:d.today.timezone,dateStyle:"medium",timeStyle:"short"}).format(s.submittedAt)}</p><p>{s.notes}</p>{s.blocker&&<p>Help requested: {s.blocker}</p>}{s.nextPractice&&<p>Next practice: {s.nextPractice}</p>}{s.correctionReason&&<p>Correction: {s.correctionReason}</p>}<p>At reporting: {s.snapshot.completed} completed / {s.snapshot.awaitingReview} awaiting review / {s.snapshot.overdue} overdue. Completed that day: {s.snapshot.completedToday.length}.</p></div>)}</details>)}
  </section>;
}
