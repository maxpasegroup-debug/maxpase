"use client";
import { useState, type ReactNode } from "react";
import { Eye, Pencil, ChevronLeft, ChevronRight } from "lucide-react";
import { curriculumIssues, curriculumSchedule, type CurriculumOjt } from "@/server/nicejobs/curriculum";
import type { z } from "zod";
import type { quizConfiguration } from "@/server/nicejobs/onboarding-input";
import { isTimezone } from "@/lib/timezone";

type Quiz = z.infer<typeof quizConfiguration>;
type Activity = CurriculumOjt["stages"][number]["activities"][number];
const blankQuiz = (): Quiz => ({form:{fields:[],duplicatePolicy:"ACTIVE_PER_VERSION",withdrawalStates:[],rejectionCategories:[]},assessment:{questions:[],passMark:100},maxAttempts:3});
export function CurriculumBuilder({value,update,resources,reviewer,renderQuiz}:{value:CurriculumOjt;update:(value:CurriculumOjt)=>void;resources:{id:string;name:string;type:string}[];reviewer:string;renderQuiz:(q:Quiz,update:(q:Quiz)=>void)=>ReactNode}) {
  const [stageIndex,setStage]=useState(0),[selectedDay,setDay]=useState(1),[preview,setPreview]=useState(false),[startDate,setStartDate]=useState("");
  const issues=curriculumIssues(value),stage=value.stages[stageIndex],activity=stage?.activities.find(a=>a.dayNumber===selectedDay),p=value.curriculum!;
  const patch=(changes:Partial<Activity>)=>update({...value,stages:value.stages.map((s,i)=>i===stageIndex?{...s,activities:s.activities.map(a=>a.key===activity?.key?{...a,...changes}:a)}:s)});
  const policy=(changes:Partial<typeof p>)=>update({...value,curriculum:{...p,...changes}});
  let dates:ReturnType<typeof curriculumSchedule>=[];
  if(startDate && p.timezone && isTimezone(p.timezone) && p.dayMode && (p.dayMode==="CALENDAR" || p.workingWeekdays.length)) {
    const anchor=new Date(startDate+"T00:00:00Z"),candidate=curriculumSchedule(value,anchor);
    const first=candidate.find(d=>d.date>=startDate);
    if(first)dates=curriculumSchedule(value,first.startsAt);
  }
  return <fieldset className="nj-curriculum"><legend>100-day curriculum</legend>
    <div className="nj-curriculum-toolbar"><strong>{issues.length ? "Incomplete draft" : "Complete schedule / Awaiting job review"}</strong><button type="button" className="button button-secondary" aria-pressed={preview} onClick={()=>setPreview(!preview)}>{preview?<Pencil size={16}/>:<Eye size={16}/>} {preview?"Edit day":"Participant preview"}</button></div>
    <p>OJT reviewer: {reviewer}. <a href="#programme-setup">Manager and reviewer assignments</a></p>
    <div className="nj-curriculum-policy"><label>Day counting<select value={p.dayMode??""} onChange={e=>policy({dayMode:(e.target.value||null) as typeof p.dayMode,workingWeekdays:[]})}><option value="">Choose calendar or working days</option><option value="CALENDAR">Calendar days</option><option value="WORKING">Working days</option></select></label>
      <label>Programme timezone<input value={p.timezone??""} placeholder="Asia/Kolkata" maxLength={100} onChange={e=>policy({timezone:e.target.value||null})}/></label>
      {p.dayMode==="WORKING" && <fieldset><legend>Working weekdays</legend>{["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"].map((name,i)=><label key={name}><input type="checkbox" checked={p.workingWeekdays.includes(i)} onChange={e=>policy({workingWeekdays:e.target.checked?[...p.workingWeekdays,i].sort():p.workingWeekdays.filter(d=>d!==i)})}/>{name}</label>)}</fieldset>}
      <label>Pause rule<select value={p.pauseRule??""} onChange={e=>policy({pauseRule:e.target.value?e.target.value as typeof p.pauseRule:null})}><option value="">Choose rule</option><option value="NOT_ALLOWED">Fixed calendar / Pausing not permitted</option><option value="HUMAN_REVIEW_FIXED_CALENDAR">Independent human review / Calendar unchanged</option></select></label>
      <label>Rescheduling rule<select value={p.rescheduleRule??""} onChange={e=>policy({rescheduleRule:e.target.value?e.target.value as typeof p.rescheduleRule:null})}><option value="">Choose rule</option><option value="NOT_ALLOWED">No deadline shifting</option><option value="HUMAN_REVIEW_EXTENSION">Independently approved deadline extensions</option></select></label>
    </div>
    <details><summary>Schedule validation: {issues.length} outstanding requirements</summary>{!issues.length?<p>All 100 days are configured. Publication still requires authorized review and approval.</p>:<ul>{issues.map((issue,i)=><li key={i}>{issue}</li>)}</ul>}</details>
    <label>Stage<select value={stageIndex} onChange={e=>{const index=Number(e.target.value);setStage(index);setDay(value.stages[index].activities[0]?.dayNumber??1);}}>{value.stages.map((s,i)=><option key={s.key} value={i}>{s.title} / Days {s.activities[0]?.dayNumber??"?"}-{s.activities.at(-1)?.dayNumber??"?"}</option>)}</select></label>
    {stage && <><label>Stage outcome/name<input maxLength={200} value={stage.title} onChange={e=>update({...value,stages:value.stages.map((s,i)=>i===stageIndex?{...s,title:e.target.value}:s)})}/></label>
      <nav className="nj-curriculum-days" aria-label="Training days">{stage.activities.map(a=><button key={a.key} type="button" aria-pressed={a.dayNumber===selectedDay} onClick={()=>setDay(a.dayNumber!)}>Day {a.dayNumber}</button>)}</nav></>}
    {activity && <section className="nj-curriculum-day"><h3>Day {activity.dayNumber}{activity.milestone?" / Stage milestone":""}</h3>
      {preview ? <><h4>{activity.title||"Title not configured"}</h4><p>{activity.learningText||"Inline learning not configured"}</p>{activity.reference && <p>Learning file: {resources.find(r=>r.id===activity.reference)?.name??"Saved file unavailable in current picker"}</p>}<h4>Practice</h4><p>{activity.instruction||"Practical task not configured"}</p><p>Expected outcome: {activity.expectedOutcome||"Not configured"}</p><p>Evidence: {activity.evidenceRequirements||"Not configured"}</p><p>{activity.practiceMinutes?`${activity.practiceMinutes} minutes` : "Practice time not configured"} / {activity.maxAttempts} attempts / Human review required</p>{activity.quiz && <ol>{activity.quiz.form.fields.map(f=><li key={f.key}>{f.label}</li>)}</ol>}<label>Preview start date<input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}/></label>{dates.find(d=>d.day===selectedDay) && <p>Scheduled date: {dates.find(d=>d.day===selectedDay)!.date} / {p.timezone}</p>}</> : <>
        <label>Day title<input maxLength={200} value={activity.title} onChange={e=>patch({title:e.target.value})}/></label>
        <label>Learning content<textarea maxLength={4000} value={activity.learningText??""} onChange={e=>patch({learningText:e.target.value})}/></label>
        <label>Published learning file<select value={activity.reference??""} onChange={e=>patch({reference:e.target.value||null})}><option value="">No linked file</option>{activity.reference && !resources.some(r=>r.id===activity.reference) && <option value={activity.reference}>Saved reference / Not in current library</option>}{resources.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
        <label>Practical task<textarea maxLength={4000} value={activity.instruction} onChange={e=>patch({instruction:e.target.value})}/></label>
        <label>Expected outcome<textarea maxLength={2000} value={activity.expectedOutcome} onChange={e=>patch({expectedOutcome:e.target.value})}/></label>
        <label>Evidence requirements<textarea maxLength={2000} value={activity.evidenceRequirements??""} onChange={e=>patch({evidenceRequirements:e.target.value})}/></label>
        <label>Activity<select value={activity.type} onChange={e=>patch({type:e.target.value as Activity["type"]})}>{["PRACTICE","SUBMIT","ROLEPLAY","OBSERVE","COMPLETE_FORM"].map(t=><option key={t}>{t}</option>)}</select></label>
        <label>Practice minutes<input type="number" min={1} max={120} value={activity.practiceMinutes??""} onChange={e=>patch({practiceMinutes:e.target.value?Number(e.target.value):null})}/></label>
        <label>Maximum evidence attempts<input type="number" min={1} max={10} value={activity.maxAttempts} onChange={e=>patch({maxAttempts:Number(e.target.value)})}/></label>
        <label><input type="checkbox" checked={!!activity.milestone} onChange={e=>patch({milestone:e.target.checked})}/>Milestone practical assessment</label>
        <label><input type="checkbox" checked={!!activity.quiz} onChange={e=>patch({quiz:e.target.checked?blankQuiz():null})}/>Comprehension quiz plus reviewed practical evidence</label>
        {activity.quiz && renderQuiz(activity.quiz,q=>patch({quiz:q}))}
      </>}
      <div className="nj-curriculum-toolbar"><button type="button" className="icon-button" title="Previous day" aria-label="Previous day" disabled={selectedDay===1} onClick={()=>{const n=selectedDay-1;setDay(n);setStage(value.stages.findIndex(s=>s.activities.some(a=>a.dayNumber===n)));}}><ChevronLeft size={20}/></button><button type="button" className="icon-button" title="Next day" aria-label="Next day" disabled={selectedDay===100} onClick={()=>{const n=selectedDay+1;setDay(n);setStage(value.stages.findIndex(s=>s.activities.some(a=>a.dayNumber===n)));}}><ChevronRight size={20}/></button></div>
    </section>}
    <label>Final practical assessment rubric<textarea maxLength={4000} value={value.assessment?.kind==="HUMAN"?value.assessment.criteria:""} onChange={e=>update({...value,assessment:e.target.value?{kind:"HUMAN",criteria:e.target.value,maxAttempts:3}:null})}/></label>
  </fieldset>;
}
