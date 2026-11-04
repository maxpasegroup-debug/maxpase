import Link from "next/link";
import type { workforceCommandCenter } from "@/server/nicejobs/command-center";

type Queue = Awaited<ReturnType<typeof workforceCommandCenter.overview>>["managerQueue"];

export function ManagerQueue({ queue, route }: { queue: Queue; route: (href: string) => string }) {
  const groups = [["applications", "Applications"], ["offers", "Offers ready for issue"], ["training", "Training reviews assigned to you"], ["missedTasks", "Missed tasks"], ["help", "Requests for help"]] as const;
  return <section aria-labelledby="manager-queue-heading"><h2 id="manager-queue-heading">Manager queue</h2><p>Current authorized records, up to five per group. Open a record to use its human decision workflow.</p>
    {groups.map(([key, label]) => { const records = queue[key]; return <div key={key}><h3>{label}</h3>{records === null ? <p>Not authorized in this scope.</p> : records.length ? <ul className="nj-command-items">{records.map(item => <li key={item.id}><Link href={route(item.href)}>{item.title}</Link><span>{item.detail}</span></li>)}</ul> : <p>No records waiting in this view.</p>}</div>; })}
  </section>;
}
