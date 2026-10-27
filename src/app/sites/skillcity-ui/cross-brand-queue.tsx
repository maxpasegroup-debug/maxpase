import { AccessError } from "@/server/authorization/engine";
import { crossBrandQueue } from "@/server/skillcity/cross-brand-queue";

const date = (value: Date | string | null) => value ? new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) + " IST" : "Not scheduled";

export async function CrossBrandQueue({ userId, mode }: { userId: string; mode: "SELF" | "TEAM" }) {
  let queue: Awaited<ReturnType<typeof crossBrandQueue.list>>;
  try { queue = await crossBrandQueue.list(userId, mode); }
  catch (error) { if (error instanceof AccessError) return <section className="sc-section"><h2>Cross-brand follow-ups</h2><p>This queue is not authorized for your account.</p></section>; throw error; }
  return <section className="sc-section" aria-labelledby={`cross-brand-${mode.toLowerCase()}`}>
    <h2 id={`cross-brand-${mode.toLowerCase()}`}>{mode === "SELF" ? "My follow-ups across divisions" : "Team follow-ups across divisions"}</h2>
    {!queue.pipelines.some(pipeline => pipeline.state === "AVAILABLE") ? <p>No CRM division is authorized for this view.</p> : <p>{queue.shown} open records shown in authorized pipelines.</p>}
    {queue.pipelines.map(pipeline => <div key={pipeline.key}>
      <h3>{pipeline.label}</h3>
      {pipeline.state === "UNAUTHORIZED" ? <p>Not authorized.</p> : pipeline.state === "NOT_CONFIGURED" ? <p>Division not configured.</p> : <>
        {pipeline.productStatus && <p>Product record: {pipeline.productStatus}.</p>}
        {!pipeline.items.length ? <p>No open assigned records in this view.</p> : <div className="sc-list">{pipeline.items.map(item => <article key={item.id}>
          <header><h4>{mode === "SELF" && pipeline.productStatus !== "Not configured" ? <a href={`#${item.source}-lead-${item.id}`}>{item.title}</a> : item.title}</h4><span>{item.status.replaceAll("_", " ")}</span></header>
          {item.ownerName && <p>Owner: {item.ownerName}</p>}
          <p>Next follow-up: {date(item.nextFollowUp ?? item.dueAt)}</p>
          <p>Last outcome: {item.outcome || "Not recorded"}</p>
        </article>)}</div>}
        {pipeline.limited && <p>Showing the first 30 scheduled or recent records in this pipeline.</p>}
        {pipeline.unavailableRecords > 0 && <p>{pipeline.unavailableRecords} record(s) could not be displayed because their stored details need review.</p>}
      </>}
    </div>)}
  </section>;
}
