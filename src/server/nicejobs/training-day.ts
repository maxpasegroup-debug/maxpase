import type { z } from "zod";
import type { trainingPlan } from "./onboarding-input";
import { curriculumSchedule,programmeLocalDate } from "./curriculum";

type Plan=z.infer<typeof trainingPlan>;
type Progress={id:string;phase:string;key:string;status:string;dueAt:Date|null;completedAt:Date|null};
export const trainingPhases=["ORIENTATION","OJT","ASSESSMENT"];
export function trainingComplete(p:Plan,r:{phase:string;key:string;status:string}){
  const lesson=p.orientation?.modules.flatMap(m=>m.lessons).find(l=>l.key===r.key),activity=p.ojt?.stages.flatMap(s=>s.activities).find(a=>a.key===r.key);
  if(r.phase==="ORIENTATION" && !lesson || r.phase==="OJT" && !activity || r.phase==="ASSESSMENT" && (r.key!=="ojt_assessment" || !p.ojt?.assessment))return false;
  const review=r.phase==="ORIENTATION"?lesson?.completion==="MENTOR_REVIEW":r.phase==="OJT"?activity?.reviewRequired:r.phase==="ASSESSMENT"?p.ojt?.assessment?.kind==="HUMAN":null;
  if(!trainingPhases.includes(r.phase))return false;
  return review?r.status==="APPROVED":["COMPLETED","APPROVED"].includes(r.status);
}
export function trainingToday(p:Plan,rows:Progress[],status:string,startedAt:Date|null,now:Date){
  const timezone=p.ojt?.curriculum?.timezone??"UTC",date=programmeLocalDate(now,timezone),schedule=p.ojt?.curriculum && startedAt?curriculumSchedule(p.ojt,startedAt):[];
  const day=schedule.find(d=>d.date===date),activities=p.ojt?.stages.flatMap(s=>s.activities.map(a=>({...a,stage:s.title})))??[];
  const todayActivity=day?activities.find(a=>a.dayNumber===day.day):null;
  const facts=rows.filter(r=>trainingPhases.includes(r.phase)).map(r=>{
    const a=activities.find(a=>a.key===r.key),scheduled=r.phase==="OJT"?schedule.find(d=>d.day===a?.dayNumber):null;
    return {...r,complete:trainingComplete(p,r),opened:!scheduled || scheduled.startsAt<=now};
  });
  const opened=facts.filter(r=>r.opened),ojt=activities.filter(a=>a.required);
  const upcoming=activities.filter(a=>a.milestone && !facts.some(r=>r.phase==="OJT" && r.key===a.key && r.complete) && (!schedule.length || (schedule.find(d=>d.day===a.dayNumber)?.dueAt.getTime()??0)>=now.getTime())).slice(0,5).map(a=>({day:a.dayNumber??null,title:a.title,stage:a.stage,date:schedule.find(d=>d.day===a.dayNumber)?.date??null}));
  return {date,timezone,day:day?.day??null,stage:todayActivity?.stage??null,todayProgressId:todayActivity?rows.find(r=>r.phase==="OJT" && r.key===todayActivity.key)?.id??null:null,nonWorkingDay:status==="OJT" && p.ojt?.curriculum?.dayMode==="WORKING" && !!schedule.length && date>=schedule[0].date && date<=schedule.at(-1)!.date && !day,beforeStart:!!schedule.length && date<schedule[0].date,scheduleEnded:!!schedule.length && date>schedule.at(-1)!.date,
    counts:{completed:facts.filter(r=>r.complete).length,pending:opened.filter(r=>!r.complete && r.status!=="SUBMITTED").length,awaitingReview:opened.filter(r=>!r.complete && r.status==="SUBMITTED").length,overdue:opened.filter(r=>!r.complete && r.dueAt && r.dueAt<now).length,future:facts.filter(r=>!r.opened && !r.complete).length},
    days:{unit:p.ojt?.curriculum?"days":"activities",completed:ojt.filter(a=>facts.some(r=>r.phase==="OJT" && r.key===a.key && r.complete)).length,required:ojt.length},upcoming};
}
export function completionSignals(raw:string|undefined,quiz:boolean,result:string|undefined){
  let data:{acknowledged?:boolean;answers?:unknown}={};try{const parsed=raw?JSON.parse(raw):{};if(parsed && typeof parsed==="object" && !Array.isArray(parsed))data=parsed;}catch{/* Malformed evidence is not a positive signal. */}
  const answers=!!data.answers && typeof data.answers==="object" && !Array.isArray(data.answers);
  return {acknowledgement:data?.acknowledged===true?"RECORDED":"NOT_RECORDED",playback:"NOT_VERIFIED",comprehension:!quiz?"NOT_REQUIRED":!answers?"NOT_RECORDED":result==="FAIL"?"FAILED":["PASS","PENDING"].includes(result??"")?"PASSED":"NOT_RECORDED"};
}
