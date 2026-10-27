import { randomUUID } from "node:crypto";
import { skillCityManagerDesk } from "@/server/skillcity/manager-desk";
import { WorkForm } from "./work-form";

const date = (value: Date | null) => value ? value.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium" }) : "No date";

export async function ManagerDesk({ userId }: { userId: string }) {
  const desk = await skillCityManagerDesk.list(userId);
  return <section className="sc-section" aria-labelledby="manager-desk-title">
    <h2 id="manager-desk-title">Manager desk</h2>
    {!desk.permitted ? <p>Team reporting is not authorized for this account.</p> : <><dl className="sc-manager-summary">{[["Direct reports", desk.summary.directReports], ["Open tasks", desk.summary.openTasks], ["Overdue tasks", desk.summary.overdueTasks], ["Open task blockers", desk.summary.openBlockers], ["Due follow-ups", desk.summary.dueFollowUps], ["My pending approvals", desk.summary.pendingDecisions]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value === null ? "Unavailable" : value}</dd></div>)}</dl><p>Work counts cover active direct reports in your authorized scopes; pending approvals are assigned to you. Missing permissions show as unavailable, not zero. {desk.summary.truncated ? "Reporting exceeds the 500-relationship limit; team totals are unavailable." : desk.summary.previewLimited ? "The work list below shows the first 50 relationships." : ""}</p>{!desk.people.length ? <p>No direct reports are assigned in your authorized scopes.</p> : <div className="sc-list">{desk.people.map(person => <article key={`${person.organizationId}:${person.personId}`}>
      <header><h3>{person.name}</h3><span>{person.scopeName}</span></header>
      <p>Current focus: {!person.focusReadable ? "Not authorized" : person.currentFocus ? `${person.currentFocus.title} (${person.currentFocus.startsOn} to ${person.currentFocus.endsOn})` : "No current approved focus period"}</p>
      <h4>Secondary work</h4>
      {!person.tasksReadable ? <p>Task records are not authorized.</p> : person.tasks.length ? <div className="sc-list">{person.tasks.map(task => <section className="sc-task" key={task.id} aria-label={task.title}>
        <h4>{task.title}</h4><p>{task.status.replaceAll("_", " ")} / Due {date(task.dueDate)}</p>
        {task.blockers.length > 0 && <ul>{task.blockers.map(blocker => <li key={blocker.id}>Blocked: {blocker.description} / Expected {date(blocker.expectedResolution)}
          {task.canManageBlockers && <details><summary>Resolve blocker</summary><WorkForm actionName="TASK_BLOCKER" reference={randomUUID()} label="Resolve blocker" confirm="Record this blocker as resolved?"><input type="hidden" name="taskId" value={task.id}/><input type="hidden" name="blockerId" value={blocker.id}/><label>Resolution evidence and reason<textarea name="reason" minLength={10} maxLength={2000} required/></label></WorkForm></details>}
        </li>)}</ul>}
        {task.canManage && <details><summary>Change status or deadline</summary><WorkForm actionName="TASK_CONTROL" reference={randomUUID()} label="Save task control" confirm="Record this task change and its reason?"><input type="hidden" name="taskId" value={task.id}/><input type="hidden" name="revision" value={task.revision}/><label>Status<select name="status" defaultValue={task.status}>{["BACKLOG", "TODO", "IN_PROGRESS", "BLOCKED"].map(status => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></label><label>Deadline<select name="deadlineMode" defaultValue="KEEP"><option value="KEEP">Keep current deadline</option><option value="SET">Set a new deadline</option><option value="CLEAR">Clear deadline</option></select></label><label>New deadline, local time<input name="dueDate" type="datetime-local"/></label><label>Reason<textarea name="reason" minLength={10} maxLength={2000} required/></label></WorkForm></details>}
        {task.canManageBlockers && <details><summary>Record a blocker</summary><WorkForm actionName="TASK_BLOCKER" reference={randomUUID()} label="Open blocker"><input type="hidden" name="taskId" value={task.id}/><label>Blocker<textarea name="description" minLength={10} maxLength={2000} required/></label><label>Expected resolution date<input name="expectedResolution" type="date"/></label><label>Reason<textarea name="reason" minLength={10} maxLength={2000} required/></label></WorkForm></details>}
      </section>)}</div> : <p>No assigned open tasks in this scope.</p>}
      <h4>Follow-ups</h4>
      {!person.followUpsReadable ? <p>Follow-up records are not authorized.</p> : person.followUps.length ? <ul>{person.followUps.map(item => <li key={item.id}>{item.title} / {item.status.replaceAll("_", " ")} / Due {date(item.dueAt)}</li>)}</ul> : <p>No due follow-ups in this scope.</p>}
      {person.focusHistory.length > 0 && <details><summary>Focus history</summary><ul>{person.focusHistory.map(item => <li key={item.id}>{item.title} / {item.startsOn} to {item.endsOn} / {item.status.toLowerCase()}</li>)}</ul></details>}
      {person.canSetFocus && <details><summary>Approve a focus period</summary><WorkForm actionName="FOCUS" reference={randomUUID()} label="Record approved focus" confirm="Record this manager decision? The previous focus remains in history.">
        <input type="hidden" name="organizationId" value={person.organizationId}/><input type="hidden" name="personId" value={person.personId}/>
        <label>Primary focus<input name="title" minLength={3} maxLength={160} required/></label>
        <label>Starts on<input name="startsOn" type="date" required/></label><label>Ends on<input name="endsOn" type="date" required/></label>
        <label>Approval evidence reference<input name="decisionReference" minLength={8} maxLength={200} required/></label>
      </WorkForm></details>}
      {person.canSetFocus && person.currentFocus && <details><summary>End current focus</summary><WorkForm actionName="FOCUS_END" reference={randomUUID()} label="End focus" confirm="End this approved focus early? The history remains available."><input type="hidden" name="focusId" value={person.currentFocus.id}/><label>Reason<textarea name="reason" minLength={10} maxLength={2000} required/></label></WorkForm></details>}
    </article>)}</div>}</>}
    <p>Focus changes priority, not access. Tasks and customer records remain governed by their own assignments and permissions.</p>
  </section>;
}
