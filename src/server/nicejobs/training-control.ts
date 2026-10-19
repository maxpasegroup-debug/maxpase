import { z } from "zod";
export class TrainingControlError extends Error {}

export const trainingControlInput = z.discriminatedUnion("kind", [
  z.object({kind:z.enum(["PAUSE","RESUME"])}).strict(),
  z.object({kind:z.literal("EXTEND"),progressId:z.string().min(1).max(200),dueAt:z.iso.datetime({offset:true})}).strict(),
  z.object({kind:z.literal("PROGRAMME_CHANGE"),versionId:z.string().min(1).max(200)}).strict()
]);
export type TrainingControl = z.infer<typeof trainingControlInput>;
export const controlDecisionInput=z.object({proposalId:z.string().min(1).max(200),decision:z.enum(["APPROVED","REJECTED"])}).strict();
type Record={id:string;kind:string;outcome:string;requirements:string|null;reviewerUserId:string;reviewerPersonId:string;feedback:string|null;reviewedAt:Date;eventId:string};

// Control proposals/decisions reuse the append-only, audited training review ledger.
export function trainingControls(rows:Record[]){
  if(rows.length>100)throw new TrainingControlError("Training control history limit reached; manual review required");
  const proposals=rows.filter(r=>r.kind==="CONTROL_PROPOSAL").map(r=>{
    const stored=JSON.parse(r.requirements??"{}"),control=trainingControlInput.parse(stored.control);
    const decisions=rows.filter(d=>d.kind==="CONTROL_DECISION" && JSON.parse(d.requirements??"{}").proposalId===r.id);
    if(decisions.length>1)throw new TrainingControlError("Conflicting training control decisions");
    const decision=decisions[0];
    return {id:r.id,control,status:decision?.outcome??"PENDING",requesterUserId:r.reviewerUserId,requesterPersonId:r.reviewerPersonId,requestedAt:r.reviewedAt,decidedAt:decision?.reviewedAt??null,feedback:decision?.feedback??r.feedback,eventId:decision?.eventId??r.eventId,versionFingerprint:stored.versionFingerprint as string|undefined};
  });
  const applied=proposals.filter(p=>p.status==="APPROVED" && ["PAUSE","RESUME"].includes(p.control.kind)).sort((a,b)=>a.decidedAt!.getTime()-b.decidedAt!.getTime());
  return {paused:applied.at(-1)?.control.kind==="PAUSE",proposals};
}

export function validateExtension(current:Date|null,next:Date,now:Date,completed:boolean){
  if(completed || !current || next<=current || next<=now || next.getTime()-current.getTime()>90*86400000)throw new TrainingControlError("Extend an incomplete requirement with an existing deadline by at most 90 elapsed days; the new deadline must be in the future");
}
