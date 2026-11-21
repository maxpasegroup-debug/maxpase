import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/server/db";
import { requireSession } from "@/server/auth/guards";
import { brandWorkspaceSlug } from "@/server/group/brand-workspaces";
import styles from "./director-dashboard.module.css";

const roleKeys = ["brand-director", "brand-administrative-officer", "brand-specialist", "brand-employee"] as const;
type RoleKey = typeof roleKeys[number];
const openStatuses = ["BACKLOG", "TODO", "IN_PROGRESS", "BLOCKED"] as const;

export default async function BrandWorkspacePage({ params, searchParams }: { params: Promise<{ brandSlug: string }>; searchParams: Promise<{ view?: string }> }) {
  const [{ brandSlug }, query, session] = await Promise.all([params, searchParams, requireSession()]);
  const brand = await prisma.brand.findFirst({ where: { slug: brandSlug, status: "ACTIVE", organization: { status: "ACTIVE", company: { status: "ACTIVE" } } }, select: { id: true, name: true, slug: true, organizationId: true, organization: { select: { id: true, name: true } } } });
  if (!brand) notFound();
  const workspace = await prisma.organization.findFirst({ where: { slug: brandWorkspaceSlug(brand.slug), parentId: brand.organization.id, type: "BUSINESS_UNIT", status: "ACTIVE" }, select: { id: true, metadata: true } });
  if (!workspace || !session.personId) redirect("/login");
  let binding: { brandId?: string; brandSlug?: string; workspaceKind?: string } = {};
  try { binding = JSON.parse(workspace.metadata ?? "{}"); } catch { notFound(); }
  if (binding.brandId !== brand.id || binding.brandSlug !== brand.slug || binding.workspaceKind !== "BRAND_DEFAULT") notFound();

  const appointment = await prisma.membership.findFirst({ where: { organizationId: workspace.id, personId: session.personId, status: "ACTIVE", roles: { some: { role: { status: "ACTIVE", principalType: "HUMAN", key: { in: [...roleKeys] } } } } }, select: { title: true, roles: { where: { role: { status: "ACTIVE", principalType: "HUMAN", key: { in: [...roleKeys] } } }, select: { role: { select: { key: true, name: true } } } } } });
  const assignment = appointment?.roles.find(({ role }) => roleKeys.includes(role.key as RoleKey));
  if (!appointment || !assignment) redirect("/app");
  const roleKey = assignment.role.key as RoleKey;
  const roleName = appointment.title ?? assignment.role.name;
  const director = roleKey === "brand-director";
  const admin = roleKey === "brand-administrative-officer";
  const view = query.view ?? "overview";
  const allowedViews = director ? ["overview", "workforce", "work", "brand"] : admin ? ["overview", "admin", "work"] : ["overview", "work"];
  if (!allowedViews.includes(view)) notFound();

  const [projectCount, openTaskCount, blockedCount, myTasks, people, pendingInvites, switcherMemberships] = await Promise.all([
    prisma.project.count({ where: { organizationId: workspace.id, status: { in: ["ACTIVE", "PLANNED", "PAUSED", "BLOCKED"] } } }),
    prisma.task.count({ where: { organizationId: workspace.id, status: { in: [...openStatuses] }, ...(director ? {} : { assigneePersonId: session.personId }) } }),
    prisma.task.count({ where: { organizationId: workspace.id, status: "BLOCKED", ...(director ? {} : { assigneePersonId: session.personId }) } }),
    prisma.task.findMany({ where: { organizationId: workspace.id, ...(director && view === "work" ? {} : { assigneePersonId: session.personId }), status: { in: [...openStatuses] } }, select: { id: true, title: true, status: true, priority: true, dueDate: true }, orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }], take: 8 }),
    director ? prisma.employment.findMany({ where: { companyId: brand.organizationId, status: "ACTIVE", assignments: { some: { brandId: brand.id, status: "ACTIVE" } } }, select: { personId: true, person: { select: { displayName: true } }, assignments: { where: { brandId: brand.id, status: "ACTIVE" }, select: { designation: true } } }, orderBy: { createdAt: "desc" }, take: 100 }) : Promise.resolve([]),
    director ? prisma.membership.count({ where: { organizationId: workspace.id, status: "INVITED" } }) : Promise.resolve(0),
    prisma.membership.findMany({ where: { personId: session.personId, status: "ACTIVE", organization: { type: "BUSINESS_UNIT", status: "ACTIVE", slug: { startsWith: "brand-workspace-" }, memberships: { some: { personId: session.personId, status: "ACTIVE" } } }, roles: { some: { role: { status: "ACTIVE", principalType: "HUMAN", key: { in: [...roleKeys] } } } } }, select: { organization: { select: { slug: true, metadata: true } } }, take: 50 })
  ]);
  const peopleById = new Map<string, { name: string; role: string }>();
  for (const row of people) peopleById.set(row.personId, { name: row.person.displayName, role: row.assignments[0]?.designation ?? "Team member" });
  const links = switcherMemberships.flatMap(({ organization }) => {
    try {
      const data = JSON.parse(organization.metadata ?? "{}");
      if (data.workspaceKind !== "BRAND_DEFAULT" || typeof data.brandSlug !== "string" || data.brandSlug === brand.slug) return [];
      return [{ slug: data.brandSlug as string, href: `/app/brand/${encodeURIComponent(data.brandSlug as string)}` }];
    } catch { return []; }
  });
  const nav = director ? [["overview", "Overview"], ["workforce", "Workforce"], ["work", "Brand work"], ["brand", "Brand profile"]] : admin ? [["overview", "Overview"], ["admin", "Admin desk"], ["work", "My work"]] : [["overview", "Overview"], ["work", "My work"]];
  const href = (key: string) => key === "overview" ? `/app/brand/${brand.slug}` : `/app/brand/${brand.slug}?view=${key}`;

  return <div className={styles.frame}>
    <a className={styles.skip} href="#brand-main">Skip to content</a>
    <aside className={styles.sidebar}>
      <Link href={`/app/brand/${brand.slug}`} className={styles.brandmark}><span className={styles.mark}>M</span><span>MAXPASE<small>GROUP</small></span></Link>
      <div className={styles.scope}><span>YOUR BRAND</span><strong>{brand.name}</strong><small>{brand.organization.name}</small></div>
      <nav className={styles.nav} aria-label="Brand dashboard">
        <span className={styles.navLabel}>WORKSPACE</span>
        {nav.map(([key, label]) => <Link key={key} href={href(key)} aria-current={view === key ? "page" : undefined}><span className={styles.navDot} aria-hidden="true" />{label}</Link>)}
        {links.length > 0 && <><span className={styles.navLabel}>YOUR OTHER BRANDS</span>{links.map(link => <Link key={link.slug} href={link.href}><span className={styles.navDot} aria-hidden="true" />{link.slug.replaceAll("-", " ")}</Link>)}</>}
      </nav>
      <div className={styles.sidebarBottom}><span className={styles.statusDot} />Secure brand access</div>
    </aside>
    <main id="brand-main" className={styles.main} tabIndex={-1}>
      <header className={styles.topbar}><div><span className={styles.eyebrow}>MAXPASE GROUP / {brand.organization.name}</span><p>Brand workspace <span aria-hidden="true">·</span> {roleName}</p></div><div className={styles.profile}><span className={styles.avatar}>{(session.email ?? "M").slice(0, 1).toUpperCase()}</span><span><strong>{session.email}</strong><small>{roleName}</small></span></div></header>
      <section className={styles.content}>
        <div className={styles.titleRow}><div><span className={styles.eyebrow}>{view === "overview" ? "BRAND COMMAND" : "BRAND WORKSPACE"}</span><h1>{view === "overview" ? `${brand.name} dashboard` : nav.find(([key]) => key === view)?.[1]}</h1><p>Welcome back. Here is the work and activity in your authorized brand scope.</p></div><span className={styles.scopeBadge}><span className={styles.statusDot} />{director ? "Director access" : roleName}</span></div>
        <div className={styles.metrics}>
          {director && <article><span>ACTIVE WORKFORCE</span><strong>{peopleById.size}</strong><small>People assigned to this brand</small></article>}
          <article><span>OPEN WORK</span><strong>{openTaskCount}</strong><small>{director ? "Across this brand" : "Assigned to you"}</small></article>
          <article><span>BLOCKED</span><strong>{blockedCount}</strong><small>{director ? "Needs attention" : "In your queue"}</small></article>
          <article><span>ACTIVE PROJECTS</span><strong>{projectCount}</strong><small>In this brand workspace</small></article>
        </div>
        <div className={styles.columns}>
          {(view === "overview" || view === "work" || view === "admin") && <section className={styles.panel} aria-labelledby="work-title"><div className={styles.panelHeading}><div><span className={styles.eyebrow}>{director && view === "work" ? "BRAND WORK" : admin ? "ADMIN DESK" : "ASSIGNED TO YOU"}</span><h2 id="work-title">{director && view === "work" ? "Brand work queue" : admin ? "Administrative queue" : "My work"}</h2></div><span className={styles.count}>{myTasks.length}</span></div>{myTasks.length ? <ul className={styles.taskList}>{myTasks.map(task => <li key={task.id}><div><strong>{task.title}</strong><small>{task.priority} priority{task.dueDate ? ` · Due ${task.dueDate.toLocaleDateString("en-IN")}` : " · No due date"}</small></div><span className={`${styles.taskState} ${task.status === "BLOCKED" ? styles.blocked : ""}`}>{task.status.replaceAll("_", " ")}</span></li>)}</ul> : <div className={styles.empty}><strong>{director && view === "work" ? "No open brand work" : "Your queue is clear"}</strong><p>New work assigned in this brand will show up here.</p></div>}</section>}
          {(director && (view === "overview" || view === "workforce")) && <section className={styles.panel} aria-labelledby="people-title"><div className={styles.panelHeading}><div><span className={styles.eyebrow}>PEOPLE</span><h2 id="people-title">Brand workforce</h2></div><span className={styles.count}>{peopleById.size}</span></div>{peopleById.size ? <ul className={styles.peopleList}>{[...peopleById.entries()].map(([id, person]) => <li key={id}><span className={styles.personAvatar}>{person.name.slice(0, 1).toUpperCase()}</span><span><strong>{person.name}</strong><small>{person.role}</small></span></li>)}</ul> : <div className={styles.empty}><strong>Ready for your team</strong><p>Add Directors, Administrative Officers and team members from the Boss HR dashboard.</p></div>}<p className={styles.panelFoot}>{pendingInvites} pending invite{pendingInvites === 1 ? "" : "s"} for this brand</p></section>}
          {view === "brand" && director && <section className={styles.panel}><span className={styles.eyebrow}>BRAND PROFILE</span><h2>{brand.name}</h2><p className={styles.description}>This brand is registered under <strong>{brand.organization.name}</strong> in MAXPASE Group. Your role is limited to this brand workspace.</p><div className={styles.profileRow}><span>Brand status</span><strong>Active</strong></div><div className={styles.profileRow}><span>Your access</span><strong>{roleName}</strong></div></section>}
          <section className={`${styles.panel} ${styles.health}`}><span className={styles.eyebrow}>SCOPE & ACCESS</span><h2>One brand. One workspace.</h2><p>Workforce and operational records shown here belong to {brand.name}. Your access is checked against your active brand appointment on every request.</p><div className={styles.healthFoot}><span className={styles.statusDot} />Access active</div></section>
        </div>
      </section>
    </main>
  </div>;
}
