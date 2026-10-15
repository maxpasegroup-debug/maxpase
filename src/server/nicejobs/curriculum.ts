import type { z } from "zod";
import { activityConfiguration, type ojtConfiguration } from "./onboarding-input";

export type CurriculumOjt = z.infer<typeof ojtConfiguration>;
export function curriculumIssues(ojt: CurriculumOjt | null | undefined) {
  const issues: string[] = [];
  if (!ojt?.curriculum) return ["Configure the complete Day 1-100 curriculum, not only its duration."];
  const policy = ojt.curriculum, days = ojt.stages.flatMap(s=>s.activities);
  if (ojt.durationDays !== 100) issues.push("The curriculum must cover 100 scheduled days.");
  if (!policy.dayMode || !policy.timezone || !policy.pauseRule || !policy.rescheduleRule || policy.dayMode === "WORKING" && !policy.workingWeekdays.length || policy.dayMode === "CALENDAR" && policy.workingWeekdays.length) issues.push("Choose day mode, timezone, working weekdays where applicable, and fixed pause/rescheduling rules.");
  const missing = Array.from({length:100},(_,i)=>i+1).filter(day=>days.filter(a=>a.dayNumber===day).length!==1);
  if (missing.length) issues.push("Missing or duplicate days: " + missing.join(", "));
  let preceding = 0;
  for (const stage of [...ojt.stages].sort((a,b)=>a.order-b.order)) {
    const ordered = [...stage.activities].sort((a,b)=>a.order-b.order);
    if (!ordered.length || ordered.some((a,i)=>a.dayNumber!==preceding+i+1)) issues.push(stage.title+": days must be consecutive and in stage order.");
    preceding += ordered.length;
    if (!ordered.at(-1)?.milestone) issues.push(stage.title+": configure an end-of-stage milestone assessment.");
    for (const a of ordered) {
      const problems = [];
      if (!activityConfiguration.safeParse(a).success) problems.push("title, practical instructions, outcome and valid quiz criteria");
      if (!a.learningText?.trim() && !a.reference) problems.push("learning content");
      if (!a.required || !a.evidenceRequired || !a.evidenceRequirements?.trim()) problems.push("mandatory evidence and its requirements");
      if (!a.reviewRequired) problems.push("human evidence review");
      if (a.dueDays) problems.push("remove legacy elapsed-day deadlines");
      if (!["PRACTICE","SUBMIT","ROLEPLAY","OBSERVE","COMPLETE_FORM","QUIZ"].includes(a.type)) problems.push("a practical activity or assessment");
      if (problems.length) issues.push(`Day ${a.dayNumber ?? "?"}: configure ${problems.join("; ")}.`);
    }
  }
  if (!ojt.assessment) issues.push("Configure the final assessment.");
  return issues;
}

export function emptyCurriculum(): CurriculumOjt {
  return {durationDays:100,curriculum:{dayMode:null,timezone:null,workingWeekdays:[],pauseRule:null,rescheduleRule:null},assessment:null,
    stages:Array.from({length:10},(_,s)=>({key:`stage_${s+1}`,title:`Stage ${s+1}`,order:s,activities:Array.from({length:10},(_,i)=>({key:`day_${s*10+i+1}`,dayNumber:s*10+i+1,title:"",type:"PRACTICE" as const,order:i,required:true,instruction:"",expectedOutcome:"",reference:null,evidenceRequired:true,reviewRequired:true,maxAttempts:3,practiceMinutes:null,dueDays:null,quiz:null,learningText:"",evidenceRequirements:"",milestone:i===9}))}))};
}

function localDate(value: Date, formatter: Intl.DateTimeFormat) {
  const parts = formatter.formatToParts(value);
  return ["year","month","day"].map(k=>parts.find(p=>p.type===k)!.value).join("-");
}
function nextDate(date: string) {return new Date(Date.parse(date+"T12:00:00Z")+86400000).toISOString().slice(0,10);}
export function programmeLocalDate(value:Date,timezone:string){return localDate(value,new Intl.DateTimeFormat("en-CA",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit"}));}
export function programmeDateBounds(date:string,timezone:string){
  const instant=Date.parse(date+"T00:00:00Z");if(!Number.isFinite(instant) || new Date(instant).toISOString().slice(0,10)!==date)throw new Error("Invalid training report date");
  const formatter=new Intl.DateTimeFormat("en-CA",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit"});
  return {start:dateStart(date,formatter),end:dateStart(nextDate(date),formatter)};
}
function dateStart(date: string, formatter: Intl.DateTimeFormat) {
  // Find the first instant of the local date, including DST midnight offsets/gaps.
  const anchor=Date.parse(date+"T00:00:00Z");let low=anchor-36*3600000,high=anchor+36*3600000;
  while(low<high){const mid=Math.floor((low+high)/2);if(localDate(new Date(mid),formatter)<date)low=mid+1;else high=mid;}
  return new Date(low);
}
export function curriculumSchedule(ojt: CurriculumOjt, start: Date) {
  const p=ojt.curriculum;
  if (!p?.timezone || !p.dayMode || p.dayMode==="WORKING" && !p.workingWeekdays.length) throw new Error("Curriculum calendar is not configured");
  const formatter=new Intl.DateTimeFormat("en-CA",{timeZone:p.timezone,year:"numeric",month:"2-digit",day:"2-digit"});
  const result:{day:number;date:string;startsAt:Date;dueAt:Date}[]=[];let date=localDate(start,formatter);
  for(let checked=0;result.length<100 && checked<800;checked++,date=nextDate(date)){
    const weekday=new Date(date+"T12:00:00Z").getUTCDay();
    if(p.dayMode==="WORKING" && !p.workingWeekdays.includes(weekday))continue;
    result.push({day:result.length+1,date,startsAt:dateStart(date,formatter),dueAt:new Date(dateStart(nextDate(date),formatter).getTime()-1)});
  }
  if(result.length!==100)throw new Error("Unable to resolve the 100-day schedule");
  return result;
}
