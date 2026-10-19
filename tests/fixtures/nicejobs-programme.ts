import { emptyProgramme } from "@/server/nicejobs/programme-configuration";
import { emptyCurriculum } from "@/server/nicejobs/curriculum";

export function fixtureProgramme(userId: string) {
  const ojt=emptyCurriculum();
  ojt.curriculum={dayMode:"CALENDAR",timezone:"Asia/Kolkata",workingWeekdays:[],pauseRule:"NOT_ALLOWED",rescheduleRule:"NOT_ALLOWED"};
  ojt.assessment={kind:"HUMAN",criteria:"Synthetic final practical assessment, not real training",maxAttempts:3};
  for(const stage of ojt.stages)for(const day of stage.activities){day.title=`Synthetic day ${day.dayNumber}`;day.learningText="Isolated test learning only";day.instruction="Perform the synthetic practice";day.expectedOutcome="Demonstrate the test outcome";day.evidenceRequirements="Provide synthetic text evidence";}
  return {
    ojt, orientation:{modules:[{key:"intro",title:"Synthetic orientation",order:0,required:true,lessons:[{key:"intro_lesson",title:"Synthetic lesson",type:"TEXT",order:0,required:true,text:"Test only",completion:"ACKNOWLEDGE"}]}]},readiness:{requireAssessment:true,criteria:"Synthetic human readiness review"},
    programmeSetup: {
      ...emptyProgramme, managerUserId: userId, publicationReviewerUserId: userId, ojtReviewerUserId: userId, readinessReviewerUserId: userId,
      engagementApproval: "Synthetic engagement approval, isolated tests only",
      compensationApproval: "Synthetic compensation and payment approval, isolated tests only",
      policyApproval: "Synthetic policy review, isolated tests only",
      trainingOutcomes: "Demonstrate the synthetic task and submit reviewed evidence."
    },
    preOfferRequired: true,
    preOffer: {
      videoTitle: "Synthetic role orientation", videoUrl: "https://media.test.invalid/role.mp4", videoVersion: "test-v1",
      comprehension: { maxAttempts: 3, form: { fields: [{ key: "understood", label: "Synthetic comprehension", type: "BOOLEAN", required: true }] }, assessment: { passMark: 100, questions: [{ field: "understood", operator: "EQ", value: true, weight: 1, required: true }] } },
      policies: [{ key: "terms", title: "Synthetic terms", version: "test-v1", text: "Isolated fixture only, not approved legal terms." }]
    }
  };
}
