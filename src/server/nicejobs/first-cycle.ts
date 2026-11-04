import { emptyCurriculum, type CurriculumOjt } from "./curriculum";

const topics: Record<"JOB-001" | "JOB-DCM", string[]> = {
  "JOB-001": [
    "Role boundaries and approved programme facts", "Privacy and permission to contact", "Opening a counselling conversation",
    "Understanding a learner's goals", "Checking programme fit", "Explaining only verified programme details",
    "Handling questions without invented promises", "Recording a useful follow-up", "Preparing a manager handoff",
    "Reviewing the full counselling journey"
  ],
  "JOB-DCM": [
    "Mentor role boundaries and verified pathways", "Privacy and permission to contact", "Opening a mentoring conversation",
    "Understanding an aspirant's goals", "Checking the correct official eligibility source", "Explaining only verified preparation options",
    "Handling questions without selection promises", "Recording a useful follow-up", "Preparing an academic handoff",
    "Reviewing the full mentoring journey"
  ]
};

/** Editorial starter only. A reviewer must replace or approve each day before publication. */
export function firstCycleDraft(code: "JOB-001" | "JOB-DCM"): CurriculumOjt {
  const result = emptyCurriculum();
  const name = code === "JOB-001" ? "counselling" : "mentoring";
  result.stages[0].title = "Foundations / draft";
  result.stages[1].title = "Guided practice / draft";
  result.stages[2].title = "Applied practice / draft";
  for (let day = 1; day <= 30; day++) {
    const topic = topics[code][Math.floor((day - 1) / 3)];
    const step = (day - 1) % 3;
    const stage = Math.floor((day - 1) / 10), index = (day - 1) % 10;
    const activity = result.stages[stage].activities[index];
    activity.title = `${topic} / ${["learn", "rehearse", "apply"][step]}`;
    activity.type = step === 1 ? "ROLEPLAY" : "PRACTICE";
    activity.learningText = `Draft guidance: ${topic}. Use the current manager-approved role, programme and policy materials. Verify unclear facts with your reviewer. Do not promise admission, selection or earnings.`;
    activity.instruction = step === 0
      ? `Read the approved material for ${topic.toLowerCase()}. Write three accurate points and one question for your reviewer. Do not use an unapproved claim.`
      : step === 1
        ? `Practice a short ${name} conversation about ${topic.toLowerCase()} with a reviewer or in a private simulation. Ask for feedback before any live outreach.`
        : `Complete one manager-assigned ${name} practice action about ${topic.toLowerCase()}. Use a real contact only when your manager has assigned it and contact permission is recorded; otherwise use a simulation. Record the next action.`;
    activity.expectedOutcome = step === 0 ? "Three checked points and one review question" : step === 1 ? "A respectful practice conversation and reviewer feedback" : "One recorded action with a clear next step, labelled real or simulated";
    activity.evidenceRequirements = step === 0 ? "Submit your own three-point summary and question; omit personal data." : step === 1 ? "Submit roleplay notes and the feedback received; do not upload another person's recording without consent." : "Submit the authorized work reference or a simulation note, outcome and next step; omit unnecessary personal data.";
    activity.practiceMinutes = 15;
    activity.maxAttempts = 3;
    if (day === 10 || day === 20 || day === 30) {
      activity.instruction += " This is a stage milestone: ask your assigned reviewer to assess accuracy, consent, follow-up quality and readiness for the next stage.";
    }
  }
  return result;
}

export function firstCycleProgress(value: CurriculumOjt) {
  const days = value.stages.flatMap(stage => stage.activities);
  const drafted = Array.from({ length: 30 }, (_, index) => index + 1).filter(number => {
    const matches = days.filter(activity => activity.dayNumber === number);
    return matches.length === 1 && !!matches[0].title.trim() && !!matches[0].learningText?.trim() && !!matches[0].instruction.trim() && !!matches[0].expectedOutcome.trim() && !!matches[0].evidenceRequirements?.trim();
  }).length;
  return { drafted, required: 30 };
}
