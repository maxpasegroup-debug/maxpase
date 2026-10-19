import { describe,it,expect } from "vitest";
import { trainingPlan } from "@/server/nicejobs/onboarding-input";
import { configuredTrainingPlan } from "@/server/nicejobs/training-programme";
import { trainingToday,trainingComplete,completionSignals } from "@/server/nicejobs/training-day";
import { programmeLocalDate,programmeDateBounds } from "@/server/nicejobs/curriculum";
import { fixtureProgramme } from "./fixtures/nicejobs-programme";
const plan=()=>configuredTrainingPlan(JSON.stringify({schemaVersion:1,...fixtureProgramme("test-reviewer")}));
describe("Daily training facts",()=>{
  it("does not equate acknowledgement, playback, comprehension or unreviewed completion with approved evidence",()=>{
    const p=plan();expect(trainingComplete(p,{phase:"OJT",key:"day_1",status:"COMPLETED"})).toBe(false);expect(trainingComplete(p,{phase:"OJT",key:"day_1",status:"APPROVED"})).toBe(true);
    expect(trainingComplete(p,{phase:"DAILY_REPORT",key:"2026-10-13",status:"APPROVED"})).toBe(false);
    expect(trainingComplete(p,{phase:"OJT",key:"unknown_activity",status:"APPROVED"})).toBe(false);
    expect(completionSignals('{"acknowledged":true}',false,"PASS")).toEqual({acknowledgement:"RECORDED",playback:"NOT_VERIFIED",comprehension:"NOT_REQUIRED"});
    expect(completionSignals('{"answers":{}}',true,"PENDING")).toMatchObject({acknowledgement:"NOT_RECORDED",comprehension:"PASSED"});
    expect(completionSignals('{"answers":{}}',true,"FAIL").comprehension).toBe("FAILED");expect(completionSignals(undefined,true,undefined).comprehension).toBe("NOT_RECORDED");
    expect(completionSignals("malformed",true,"PASS").comprehension).toBe("NOT_RECORDED");
  });
  it("separates future practice, pending evidence, review waits and overlapping overdue flags",()=>{
    const p=plan(),start=new Date("2026-10-13T08:00:00Z"),now=new Date("2026-10-14T08:00:00Z");
    const rows=[{id:"one",phase:"OJT",key:"day_1",status:"SUBMITTED",dueAt:new Date("2026-10-13T18:29:59Z"),completedAt:null},{id:"two",phase:"OJT",key:"day_2",status:"PENDING",dueAt:new Date("2026-10-14T18:29:59Z"),completedAt:null},{id:"three",phase:"OJT",key:"day_3",status:"PENDING",dueAt:new Date("2026-10-15T18:29:59Z"),completedAt:null}];
    const today=trainingToday(p,rows,"OJT",start,now);expect(today).toMatchObject({date:"2026-10-14",day:2,todayProgressId:"two",counts:{completed:0,pending:1,awaitingReview:1,overdue:1,future:1},days:{completed:0,required:100}});expect(today.upcoming[0].day).toBe(10);
  });
  it("does not invent lessons on nonworking dates and preserves unresolved milestones",()=>{
    const p=plan();p.ojt!.curriculum!.dayMode="WORKING";p.ojt!.curriculum!.workingWeekdays=[1,2,3,4,5];
    expect(trainingToday(p,[],"OJT",new Date("2026-10-16T08:00Z"),new Date("2026-10-17T08:00Z"))).toMatchObject({nonWorkingDay:true,day:null,todayProgressId:null});
    expect(trainingToday(trainingPlan.parse({orientation:null,ojt:null,readiness:null}),[],"NOT_STARTED",null,new Date()).days.required).toBe(0);
    const ended=trainingToday(p,[],"OJT",new Date("2026-10-16T08:00Z"),new Date("2028-01-01T08:00Z"));expect(ended.scheduleEnded).toBe(true);expect(ended.nonWorkingDay).toBe(false);expect(ended.upcoming).toHaveLength(0);
  });
  it("uses the programme's local report date and DST-aware date bounds",()=>{
    expect(programmeLocalDate(new Date("2026-10-13T20:00:00Z"),"Asia/Kolkata")).toBe("2026-10-14");
    const b=programmeDateBounds("2026-10-14","Asia/Kolkata");expect(b.start.toISOString()).toBe("2026-10-13T18:30:00.000Z");
    const dst=programmeDateBounds("2026-11-01","America/New_York");expect(dst.end.getTime()-dst.start.getTime()).toBe(25*3600000);
  });
});
