import { randomUUID } from "node:crypto";
import type { skillCityDeveloperDesk } from "@/server/skillcity/developer-desk";
import { WorkForm } from "./work-form";

type Desk = Awaited<ReturnType<typeof skillCityDeveloperDesk.workspace>>;
const date = (value: Date | null) => value ? value.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium" }) : "Not set";

export function DeveloperWorkspace({ desk, portal = "skillcity" }: { desk: Desk; portal?: "skillcity" | "labs" }) {
  return <>
    <header className="sc-heading"><p>AIRA Labs delivery</p><h1>My developer desk</h1><span>My assigned work, reviews and testing</span></header>
    <section className="sc-section" aria-labelledby="developer-work-title">
      <h2 id="developer-work-title">My work</h2>
      {!desk.projects.length ? <p>No Labs tasks or review duties are assigned to your account. Ask your director to assign work.</p> : desk.projects.map(project => <article className="sc-project" key={project.id}>
        <header><h3>{project.name}</h3><span>{project.status.replaceAll("_", " ")}</span></header>
        <p>Target: {date(project.targetDate)}</p>
        <p>Specification: {project.specification ?? "Not recorded"}</p>
        {project.tasks.map(task => <section className="sc-task" key={task.id} aria-label={task.title}>
          <h4>{task.title}</h4>
          <p>{task.own ? "Assigned delivery" : "Independent review"} / {task.status.replaceAll("_", " ")} / Due {date(task.dueDate)}</p>
          <p>{task.description || "No technical notes yet."}</p>
          {task.own && task.canUpdate && <details><summary>Update progress</summary><WorkForm portal={portal} actionName="TASK" reference={randomUUID()} label="Save progress">
            <input type="hidden" name="taskId" value={task.id}/><input type="hidden" name="revision" value={task.revision}/>
            <label>Status<select name="status" defaultValue={task.status}>{["TODO", "IN_PROGRESS", "BLOCKED"].map(status => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></label>
            <label>Technical notes or blocker<textarea name="description" maxLength={4000} defaultValue={task.description ?? ""}/></label>
          </WorkForm></details>}
          {task.own && task.canUpdate && <details><summary>Record contribution</summary><WorkForm portal={portal} actionName="DEV_CONTRIBUTE" reference={randomUUID()} label="Record contribution">
            <input type="hidden" name="taskId" value={task.id}/><label>Work completed and evidence reference<textarea name="detail" minLength={10} maxLength={4000} required/></label>
          </WorkForm></details>}
          {task.duties.map(duty => <details key={duty}><summary>{duty === "TESTING" ? "Record testing" : "Record code review"}</summary><WorkForm portal={portal} actionName="DEV_REVIEW" reference={randomUUID()} label="Record review" confirm="Record this independent review? It does not accept or complete the project.">
            <input type="hidden" name="taskId" value={task.id}/><input type="hidden" name="duty" value={duty}/>
            <label>Outcome<select name="verdict"><option value="APPROVED">Reviewed, no rework requested</option><option value="REWORK">Rework requested</option></select></label>
            <label>Findings and evidence<textarea name="comment" minLength={10} maxLength={4000} required/></label>
          </WorkForm></details>)}
          {task.history.length > 0 && <details><summary>Contribution and review history</summary><ol>{task.history.map(item => <li key={item.id}><strong>{item.kind}</strong> / {date(item.createdAt)} / {item.detail}</li>)}</ol></details>}
        </section>)}
      </article>)}
    </section>
  </>;
}
