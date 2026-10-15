import { describe,it,expect } from "vitest";
import { trainingControlInput,trainingControls,validateExtension } from "@/server/nicejobs/training-control";
import { registeredTool,routeIntent } from "@/server/sia/registry";
const now=new Date("2026-10-13T08:00:00Z");
describe("Reviewed training interventions",()=>{
  it("rejects arbitrary identities, scope and financial commands",()=>{
    for(const value of [{kind:"PAUSE",actorUserId:"forged"},{kind:"EXTEND",progressId:"p",dueAt:"tomorrow"},{kind:"PAY"},{kind:"ACTIVATE"},{kind:"PROGRAMME_CHANGE",versionId:"v",companyId:"forged"}])expect(trainingControlInput.safeParse(value).success).toBe(false);
  });
  it("keeps proposals separate from applied pause and immutable decisions",()=>{
    const proposal={id:"p",kind:"CONTROL_PROPOSAL",outcome:"PENDING",requirements:JSON.stringify({control:{kind:"PAUSE"}}),reviewerUserId:"u",reviewerPersonId:"person",feedback:"Draft guidance",reviewedAt:now,eventId:"e"};
    const decision={...proposal,id:"d",kind:"CONTROL_DECISION",outcome:"APPROVED",requirements:JSON.stringify({proposalId:"p"}),reviewerUserId:"independent",reviewerPersonId:"independent-person",reviewedAt:new Date(now.getTime()+1000)};
    expect(trainingControls([proposal]).paused).toBe(false);expect(trainingControls([proposal,decision]).paused).toBe(true);
    expect(trainingControls([proposal,{...decision,outcome:"REJECTED"}]).paused).toBe(false);
    expect(()=>trainingControls([proposal,decision,{...decision,id:"duplicate"}])).toThrow("Conflicting");
  });
  it("bounds control history and deadline extensions",()=>{
    const current=new Date(now.getTime()+86400000),later=new Date(current.getTime()+86400000);
    expect(()=>validateExtension(current,later,now,false)).not.toThrow();
    for(const next of [now,current,new Date(current.getTime()+91*86400000)])expect(()=>validateExtension(current,next,now,false)).toThrow();
    expect(()=>validateExtension(null,later,now,false)).toThrow();expect(()=>validateExtension(current,later,now,true)).toThrow();
    expect(()=>trainingControls(Array.from({length:101},()=>({id:"p",kind:"CONTROL_PROPOSAL",outcome:"PENDING",requirements:"{}",reviewerUserId:"u",reviewerPersonId:"p",feedback:null,reviewedAt:now,eventId:"e"})))).toThrow("limit");
  });
  it("registers manager guidance only as audited read-only evidence",()=>{
    expect(routeIntent("Prepare training management summary")).toBe("get_training_management");
    const tool=registeredTool("get_training_management")!;
    expect(tool.risk).toBe("READ_ONLY");expect(tool.requiredPermission).toBe("nicejobs.onboarding.read");expect(tool.audit).toBe(true);
    for(const key of ["approve_employment","approve_compensation","approve_payment","activate_worker"])expect(registeredTool(key)).toBeUndefined();
  });
});
