import { describe,it,expect } from "vitest";
import { curriculumIssues,curriculumSchedule,emptyCurriculum } from "@/server/nicejobs/curriculum";
import { ojtConfiguration } from "@/server/nicejobs/onboarding-input";
import { fixtureProgramme } from "./fixtures/nicejobs-programme";
import { learningSummary } from "@/server/nicejobs/learning-summary";
import { configuration } from "@/server/nicejobs/input";

const complete=()=>ojtConfiguration.parse(fixtureProgramme("synthetic-reviewer").ojt);
describe("100-day curriculum and calendar",()=>{
  it("bounds the saved curriculum size and requires uploaded references for oversized inline lessons",()=>{
    const ojt=complete();for(const stage of ojt.stages)for(const day of stage.activities){day.learningText="a".repeat(4000);day.instruction="b".repeat(4000);day.expectedOutcome="c".repeat(2000);day.evidenceRequirements="d".repeat(2000);}
    const parsed=configuration.safeParse({schemaVersion:1,ojt});expect(parsed.success).toBe(false);if(!parsed.success)expect(parsed.error.message).toContain("750 KiB");
  });
  it("saves empty day slots as incomplete drafts and never equates duration with completeness",()=>{
    const draft=ojtConfiguration.parse(emptyCurriculum());expect(draft.stages.flatMap(s=>s.activities)).toHaveLength(100);
    expect(curriculumIssues(draft).length).toBeGreaterThan(100);expect(curriculumIssues(null)[0]).toContain("not only its duration");
    expect(curriculumIssues(complete())).toEqual([]);
  });
  it("finds missing/duplicate days, mandatory evidence, learning, practical work and milestones",()=>{
    const value=complete();value.stages[0].activities[0].dayNumber=2;
    value.stages[1].activities[0].evidenceRequirements="";value.stages[1].activities[0].learningText="";value.stages[1].activities[0].required=false;
    value.stages[1].activities[9].milestone=false;
    expect(curriculumIssues(value).join(" ")).toMatch(/Missing or duplicate days: 1, 2/);
    expect(curriculumIssues(value).join(" ")).toContain("learning content");expect(curriculumIssues(value).join(" ")).toContain("milestone assessment");
    value.stages[0].activities[0].type="READ";expect(curriculumIssues(value).join(" ")).toContain("practical activity");
    value.assessment=null;expect(curriculumIssues(value)).toContain("Configure the final assessment.");
  });
  it("rejects invalid timezones, unsupported pause/rescheduling and legacy incomplete activities",()=>{
    const value=complete();expect(ojtConfiguration.safeParse({...value,curriculum:{...value.curriculum,timezone:"not/a-zone"}}).success).toBe(false);
    expect(ojtConfiguration.safeParse({...value,curriculum:{...value.curriculum,pauseRule:"AUTO_PAUSE"}}).success).toBe(false);
    expect(ojtConfiguration.safeParse({...emptyCurriculum(),curriculum:null}).success).toBe(false);
    value.curriculum!.pauseRule=null;expect(curriculumIssues(value).join(" ")).toContain("pause/rescheduling");
  });
  it("anchors calendar dates to the chosen timezone rather than elapsed UTC blocks",()=>{
    const value=complete(), dates=curriculumSchedule(value,new Date("2026-10-13T23:00:00Z"));
    expect(dates).toHaveLength(100);expect(dates[0]).toMatchObject({day:1,date:"2026-10-14"});
    expect(dates[0].startsAt.toISOString()).toBe("2026-10-13T18:30:00.000Z");
    expect(dates[0].dueAt.toISOString()).toBe("2026-10-14T18:29:59.999Z");
    expect(dates[99].date).toBe("2027-01-21");
  });
  it("skips configured nonworking weekdays and requires a selected working week",()=>{
    const value=complete();value.curriculum!.dayMode="WORKING";value.curriculum!.workingWeekdays=[1,2,3,4,5];
    const dates=curriculumSchedule(value,new Date("2026-10-17T09:00:00Z"));expect(dates[0].date).toBe("2026-10-19");expect(dates[5].date).toBe("2026-10-26");
    const summary=learningSummary(value,[],new Date("2026-10-17T09:00:00Z"),new Date("2026-10-18T09:00:00Z"));expect(summary.elapsedDay).toBe(0);
    value.curriculum!.workingWeekdays=[];expect(()=>curriculumSchedule(value,new Date())).toThrow("not configured");
  });
  it("uses actual DST date boundaries without inventing fixed 24-hour days",()=>{
    const value=complete();value.curriculum!.timezone="America/New_York";
    const spring=curriculumSchedule(value,new Date("2026-03-08T12:00:00Z"))[0];expect(spring.dueAt.getTime()+1-spring.startsAt.getTime()).toBe(23*3600000);
    const fall=curriculumSchedule(value,new Date("2026-11-01T12:00:00Z"))[0];expect(fall.dueAt.getTime()+1-fall.startsAt.getTime()).toBe(25*3600000);
  });
});
