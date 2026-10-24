import { randomUUID } from "node:crypto";
import { skillCityDeveloperDesk } from "@/server/skillcity/developer-desk";
import { AccessError } from "@/server/authorization/engine";
import { WorkForm } from "./work-form";

export async function DeveloperAssignments({ userId }: { userId: string }) {
  let desk: Awaited<ReturnType<typeof skillCityDeveloperDesk.management>>;
  try { desk = await skillCityDeveloperDesk.management(userId); }
  catch (error) { if (error instanceof AccessError) return null; throw error; }
  return <section className="sc-section" aria-labelledby="developer-assignments-title">
    <h2 id="developer-assignments-title">Labs developer assignments</h2>
    {!desk.projects.length ? <p>No active Labs delivery project is available.</p> : !desk.developers.length ? <p>No verified Labs developer account is eligible for assignment.</p> : desk.projects.map(project => <article className="sc-project" key={project.id}>
      <h3>{project.name}</h3>
      <details><summary>Create an assigned task</summary><WorkForm actionName="DEV_ASSIGN" reference={randomUUID()} label="Assign task" confirm="Assign this Labs task to the selected developer?">
        <input type="hidden" name="projectId" value={project.id}/>
        <label>Task title<input name="title" minLength={3} maxLength={200} required/></label>
        <label>Due date and time<input name="dueDate" type="datetime-local" required/></label>
        <label>Developer<select name="developerUserId" required>{desk.developers.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
      </WorkForm></details>
      {project.tasks.map(task => <div className="sc-task" key={task.id}>
        <h4>{task.title}</h4><p>{task.status.replaceAll("_", " ")} / {task.assigneePersonId ? "Assigned" : "Unassigned"}</p>
        <details><summary>{task.assigneePersonId ? "Change assignee" : "Assign developer"}</summary><WorkForm actionName="DEV_ASSIGN" reference={randomUUID()} label="Save assignment" confirm="Change this task's assignee? Existing contribution history is preserved.">
          <input type="hidden" name="projectId" value={project.id}/><input type="hidden" name="taskId" value={task.id}/>
          <label>Developer<select name="developerUserId" defaultValue={task.assigneePersonId ? desk.developers.find(person => person.personId === task.assigneePersonId)?.id : undefined} required>{desk.developers.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
        </WorkForm></details>
        {desk.canAssignDuty && task.assigneePersonId && <details><summary>Assign independent review or testing</summary><WorkForm actionName="DEV_DUTY" reference={randomUUID()} label="Assign duty" confirm="Assign an independent developer to this duty?">
          <input type="hidden" name="taskId" value={task.id}/>
          <label>Responsibility<select name="duty"><option value="CODE_REVIEW">Code review</option><option value="TESTING">Testing</option></select></label>
          <label>Reviewer<select name="reviewerUserId" required>{desk.developers.filter(person => person.personId !== task.assigneePersonId).map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
        </WorkForm></details>}
        {desk.canComplete && task.assigneePersonId && <details><summary>Decide reviewed completion</summary><p>Current independent code review and testing must both be approved. Open blockers prevent completion.</p><WorkForm actionName="DEV_COMPLETE" reference={randomUUID()} label="Complete reviewed task" confirm="Complete this task after verifying both independent reviews?">
          <input type="hidden" name="taskId" value={task.id}/><input type="hidden" name="revision" value={task.revision}/>
          <label>Decision reason<textarea name="reason" minLength={10} maxLength={2000} required/></label>
        </WorkForm></details>}
      </div>)}
    </article>)}
  </section>;
}
