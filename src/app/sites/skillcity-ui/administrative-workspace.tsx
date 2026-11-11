import { randomUUID } from "node:crypto";
import { ArrowUpRight, BriefcaseBusiness, Building2, CalendarClock, CheckSquare, CircleDollarSign, FileCheck2, FileText, Users } from "lucide-react";
import { WorkForm } from "./work-form";
import type { createSkillCityAdministrativeDesk } from "@/server/skillcity/administrative-desk";

type Desk = Awaited<ReturnType<ReturnType<typeof createSkillCityAdministrativeDesk>["workspace"]>>;
const words = (value: string) => value.replaceAll("_", " ").toLowerCase();
const date = (value: Date | null) => value ? new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(value) + " IST" : "No due date";
const dateLabel = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "full" }).format(new Date());

export function AdministrativeWorkspace({ data }: { data: Desk }) {
  const metrics = [
    { label: "My open tasks", value: data.tasks.length, note: "Assigned to you · current list", icon: CheckSquare, href: "#ao-tasks" },
    { label: "Customer records", value: data.customers.length, note: "Active contacts · current list", icon: Users, href: "#ao-customers" },
    { label: "Quotations", value: data.quotations.length, note: "Recent AIRA Labs records", icon: FileText, href: "#ao-commercial" },
    { label: "Invoices", value: data.invoices.length, note: "Recent company records", icon: CircleDollarSign, href: "#ao-commercial" },
  ];

  return <div className="ao-dashboard">
    <aside className="ao-sidebar" aria-label="Administrative workspace sections">
      <div className="ao-sidebar-title"><Building2 size={21}/><span>Central Administration<small>Company workspace</small></span></div>
      <nav>
        <a href="#ao-dashboard" aria-current="page"><Building2 size={18}/>Dashboard</a>
        <a href="#ao-documents"><FileCheck2 size={18}/>Company &amp; Documents</a>
        <a href="#ao-business-units"><BriefcaseBusiness size={18}/>Brands &amp; Business Units</a>
        <a href="#ao-tasks"><CheckSquare size={18}/>My Tasks</a>
        <a href="#ao-customers"><Users size={18}/>Customer Contacts</a>
        <a href="#ao-commercial"><FileText size={18}/>Quotation &amp; Invoice Status</a>
      </nav>
      <p className="ao-sidebar-note">Finance approvals, payroll, admissions, purchasing, and staff administration require separate access.</p>
    </aside>

    <div className="ao-content" id="ao-dashboard">
      <header className="ao-titlebar">
        <div><p className="ao-eyebrow">AIRA Skill City Private Limited <span> / </span> Central Administration Office</p><h1>Hybrid Operations</h1><p>Company coordination, assigned work and approved record maintenance.</p></div>
        <div className="ao-date"><CalendarClock size={17}/>{dateLabel}</div>
      </header>

      <section className="ao-metrics" aria-label="Administrative overview">
        {metrics.map(({ label, value, note, icon: Icon, href }) => <a className="ao-metric" href={href} key={label}><span className="ao-metric-icon"><Icon size={20}/></span><span className="ao-metric-label">{label}</span><strong>{value}</strong><small>{note}</small></a>)}
      </section>

      <div className="ao-grid ao-overview-grid">
        <section className="ao-panel" id="ao-business-units"><header><div><p className="ao-eyebrow">Organization</p><h2>Brands &amp; business units</h2></div></header>
          <p className="ao-company-name">{data.company.name}</p><p className="ao-muted">Company status: {words(data.company.status)}{data.company.region ? ` · ${data.company.region}` : ""}</p>
          <div className="ao-units">{data.divisions.map(division => <article key={division.id}><span className="ao-unit-icon"><BriefcaseBusiness size={17}/></span><div><strong>{division.name}</strong><small>Active division</small></div></article>)}</div>
          <p className="ao-muted">This view includes the company and active divisions. The AO role does not grant access to division financial or employee records.</p>
        </section>
        <section className="ao-panel ao-attention" id="ao-documents"><header><div><p className="ao-eyebrow">Coordination</p><h2>Documents &amp; verification</h2></div><FileCheck2 size={21}/></header>
          <div className="ao-document-status"><span>Billing profile</span><strong>{words(data.documents.profileStatus)}</strong></div>
          <div className="ao-document-status"><span>Evidence awaiting independent review</span><strong>{data.documents.awaitingIndependentReview}</strong></div>
          <p className="ao-muted">You can track status. Legal evidence verification and CA-approved tax settings remain with authorized reviewers.</p>
        </section>
      </div>

      <section className="ao-panel ao-quick-panel"><header><div><p className="ao-eyebrow">Shortcuts</p><h2>Quick actions</h2></div><span className="ao-muted">Go directly to work available in your role</span></header>
        <div className="ao-quick-actions"><a href="#ao-tasks"><CheckSquare size={20}/><span>Review my tasks</span><ArrowUpRight size={16}/></a><a href="#ao-customers"><Users size={20}/><span>Maintain customer contacts</span><ArrowUpRight size={16}/></a><a href="#ao-commercial"><FileText size={20}/><span>Check document status</span><ArrowUpRight size={16}/></a><a href="#ao-documents"><FileCheck2 size={20}/><span>Track company evidence</span><ArrowUpRight size={16}/></a></div>
      </section>

      <div className="ao-grid ao-work-grid">
        <section className="ao-panel" id="ao-tasks"><header><div><p className="ao-eyebrow">My work</p><h2>Tasks assigned to me</h2></div><span className="ao-count">{data.tasks.length}</span></header>
          {!data.permissions.canTasks ? <p className="ao-empty">Task access is not granted for this account.</p> : !data.tasks.length ? <p className="ao-empty">No open tasks are assigned to you.</p> : <div className="ao-record-list">{data.tasks.map(task=><article key={task.id}><header><h3>{task.title}</h3><span className="ao-status">{words(task.status)}</span></header><p>{task.organization.name} · {words(task.priority)} priority · Due {date(task.dueDate)}</p>{data.permissions.canUpdateTasks ? <details><summary>Update my task</summary><WorkForm actionName="AO_TASK_UPDATE" reference={randomUUID()} label="Save task update" confirm="Update this task? Marking it complete will notify the project workflow."><input type="hidden" name="taskId" value={task.id}/><input type="hidden" name="revision" value={task.revision}/><label>New status<select name="taskStatus" required defaultValue={task.status === "IN_PROGRESS" ? "COMPLETED" : "IN_PROGRESS"}>{task.status !== "IN_PROGRESS" && <option value="IN_PROGRESS">In progress</option>}<option value="COMPLETED">Completed</option></select></label><label>Work note<textarea name="taskNote" minLength={10} maxLength={2000} required placeholder="Describe the work completed or the next action."/></label></WorkForm></details> : <p>Task updates are not authorized for this account.</p>}</article>)}</div>}
        </section>

        <section className="ao-panel" id="ao-commercial"><header><div><p className="ao-eyebrow">Status visibility</p><h2>Quotations &amp; invoices</h2></div><FileText size={20}/></header>
          {!data.permissions.canCommercial ? <p className="ao-empty">Commercial status access is not granted for this account.</p> : <><h3 className="ao-subheading">Quotations</h3>{!data.quotations.length ? <p className="ao-empty">No recent AIRA Labs quotation records.</p> : <div className="ao-record-list">{data.quotations.map(row=><article key={row.id}><header><h3>{row.title}</h3><span className="ao-status">{words(row.status)}</span></header><p>Updated {date(row.updatedAt)}{row.dueAt ? ` · Valid until ${date(row.dueAt)}` : ""}{row.converted ? " · Converted to invoice" : ""}</p></article>)}</div>}<h3 className="ao-subheading">Invoices</h3>{!data.invoices.length ? <p className="ao-empty">No recent company invoice records.</p> : <div className="ao-record-list">{data.invoices.map(row=><article key={row.id}><header><h3>{row.invoiceNumber}</h3><span className="ao-status">{words(row.status)}</span></header><p>{row.customerName} · Issued {date(row.issueDate)}</p><p>Delivery state: {words(row.deliveryStatus)}. Customer delivery is not claimed unless provider evidence exists.</p></article>)}</div>}<p className="ao-muted">Status only. This role cannot issue invoices, download financial documents, reconcile payments or view bank details.</p></>}
        </section>
      </div>

      <div className="ao-grid ao-bottom-grid">
        <section className="ao-panel" id="ao-customers"><header><div><p className="ao-eyebrow">Approved maintenance</p><h2>Customer contact records</h2></div><Users size={20}/></header>
          <p className="ao-muted">Maintain contact and billing-address details. GSTIN, tax status and place of supply are not editable here.</p>{!data.permissions.canCustomers ? <p className="ao-empty">Customer records are not authorized for this account.</p> : !data.customers.length ? <p className="ao-empty">No active AIRA Skill City customer records are available.</p> : <div className="ao-record-list">{data.customers.map(customer=><article key={customer.id}><header><h3>{customer.legalName}</h3><span>{customer.businessName ?? "Customer"}</span></header><p>{customer.contactPerson || "No contact recorded"} · {customer.email || "No email"} · {customer.phone || "No phone"}</p><details><summary>Update contact and billing address</summary>{data.permissions.canEditCustomers ? <WorkForm actionName="AO_CUSTOMER_CONTACT" reference={randomUUID()} label="Save customer contact details" confirm="Save these customer contact or billing-address changes? Existing quotations and invoices remain unchanged."><input type="hidden" name="customerId" value={customer.id}/><input type="hidden" name="version" value={customer.version}/><label>Contact person<input name="contactPerson" maxLength={160} defaultValue={customer.contactPerson ?? ""}/></label><label>Email<input name="email" type="email" maxLength={254} defaultValue={customer.email ?? ""}/></label><label>Phone<input name="phone" maxLength={30} defaultValue={customer.phone ?? ""}/></label><label>Billing address<textarea name="billingAddress" minLength={5} maxLength={1000} defaultValue={customer.billingAddress}/></label><label>PIN code<input name="pinCode" inputMode="numeric" pattern="[0-9]{6}" required defaultValue={customer.pinCode}/></label><label>Administrative notes<textarea name="notes" maxLength={2000} defaultValue={customer.notes ?? ""}/></label></WorkForm> : <p>Customer contact editing is not authorized.</p>}</details></article>)}</div>}
        </section>
        <section className="ao-panel" id="ao-activity"><header><div><p className="ao-eyebrow">Audit trail</p><h2>Recent activity</h2></div><CalendarClock size={20}/></header>
          {!data.permissions.canEvents ? <p className="ao-empty">Activity history is not authorized for this account.</p> : !data.recentActivity.length ? <p className="ao-empty">No recent company activity is recorded.</p> : <div className="ao-record-list">{data.recentActivity.map(event=><article key={event.id}><h3>{words(event.eventType)}</h3><p>{event.entityType} · {words(event.status)} · {date(event.createdAt)}</p></article>)}</div>}
        </section>
      </div>
      <p className="ao-footer-note">Displayed lists are limited to the recent records or page size noted. Amounts, payment actions, payroll, admissions and approvals are not part of this AO workspace.</p>
    </div>
  </div>;
}
