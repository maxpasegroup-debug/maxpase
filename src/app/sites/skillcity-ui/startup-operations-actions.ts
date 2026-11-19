"use server";
import { revalidatePath } from "next/cache";
import { getPortalSession } from "@/server/portals/session";
import { requestPortal } from "@/server/portals/request";
import { startupOperationsDesk } from "@/server/skillcity/startup-operations-desk";
import { startupCentreDesk } from "@/server/skillcity/startup-centre-desk";
import { startupRecordsGrievancesDesk } from "@/server/skillcity/startup-records-grievances-desk";
import { startupFinanceDesk } from "@/server/skillcity/startup-finance-desk";
import { consumeSecurityBudget, securityKey } from "@/server/security/rate-limit";

export type StartupOpsActionState = { error?: string; message?: string };
const field = (form: FormData, key: string) => String(form.get(key) ?? "");
export async function startupOpsAction(_state: StartupOpsActionState, form: FormData): Promise<StartupOpsActionState> {
  const { site } = await requestPortal("skillcity", true);
  const session = await getPortalSession(site);
  if (!session) return { error: "Please sign in again before submitting." };
  try {
    await consumeSecurityBudget(securityKey("skillcity:startup-operations", session.userId), 12, 60);
    if (field(form, "action") === "FINANCE_POLICY") {
      const amountPaise = await startupFinanceDesk.savePolicy(session.userId, { amount: field(form, "amount") });
      revalidatePath("/sites/skillcity/gateway"); revalidatePath("/gateway");
      return { message: `Routine AO approval limit saved: ₹${(Number(amountPaise) / 100).toLocaleString("en-IN")}.` };
    }
    if (field(form, "action") === "FINANCE_BUDGET") {
      await startupFinanceDesk.saveBudget(session.userId, { centreId: field(form,"centreId"), department: field(form,"department"), period: field(form,"period"), amount: field(form,"amount"), note: field(form,"note") });
      revalidatePath("/sites/skillcity/gateway"); revalidatePath("/gateway");
      return { message: "Budget proposal sent to the Director. It is not available to spend until approved." };
    }
    if (field(form, "action") === "FINANCE_REQUEST") {
      const file = form.get("billFile");
      const uploaded = file instanceof File && file.size ? { name: file.name, type: file.type, bytes: new Uint8Array(await file.arrayBuffer()) } : undefined;
      await startupFinanceDesk.submitRequest(session.userId, { requestType: field(form,"requestType"), centreId: field(form,"centreId"), department: field(form,"department"), period: field(form,"period"), budgetId: field(form,"budgetId"), amount: field(form,"amount"), title: field(form,"title"), vendor: field(form,"vendor"), description: field(form,"description"), dueAt: field(form,"dueAt") ? new Date(field(form,"dueAt")).toISOString() : "" }, uploaded);
      revalidatePath("/sites/skillcity/gateway"); revalidatePath("/gateway");
      return { message: "Finance request sent to the AO. No approval or payment has been made." };
    }
    if (field(form, "action") === "FINANCE_DECIDE") {
      await startupFinanceDesk.decideRequest(session.userId, { id: field(form,"id"), version: field(form,"version"), decision: field(form,"decision"), reason: field(form,"reason") });
      revalidatePath("/sites/skillcity/gateway"); revalidatePath("/gateway");
      return { message: "Finance decision saved in the approval history." };
    }
    if (field(form, "action") === "FINANCE_PAYMENT") {
      await startupFinanceDesk.recordPayment(session.userId, { id: field(form,"id"), version: field(form,"version"), paymentReference: field(form,"paymentReference"), paidAt: field(form,"paidAt") ? new Date(field(form,"paidAt")).toISOString() : "" });
      revalidatePath("/sites/skillcity/gateway"); revalidatePath("/gateway");
      return { message: "Payment status recorded with a reference." };
    }
    if (field(form, "action") === "FINANCE_BILL") {
      const file = form.get("billFile"); if (!(file instanceof File) || !file.size) throw new Error("Choose the bill or receipt file.");
      await startupFinanceDesk.addBill(session.userId, field(form,"id"), { name: file.name, type: file.type, bytes: new Uint8Array(await file.arrayBuffer()) });
      revalidatePath("/sites/skillcity/gateway"); revalidatePath("/gateway");
      return { message: "Bill added to the approved finance record." };
    }
    if (field(form, "action") === "RECORD_UPLOAD") {
      const file = form.get("recordFile");
      if (!(file instanceof File) || file.size === 0) throw new Error("Choose a PDF or image to upload.");
      await startupRecordsGrievancesDesk.uploadDocument(session.userId, { documentType: field(form,"documentType"), category: field(form,"category"), title: field(form,"title"), entityLabel: field(form,"entityLabel"), entityReference: field(form,"entityReference"), tags: field(form,"tags"), sensitive: form.get("sensitive") === "on" }, { name: file.name, type: file.type, bytes: new Uint8Array(await file.arrayBuffer()) });
      revalidatePath("/sites/skillcity/gateway"); revalidatePath("/gateway");
      return { message: "Private document added to the Startup Skool records register." };
    }
    if (field(form, "action") === "GRIEVANCE_SUBMIT") {
      const reference = await startupRecordsGrievancesDesk.submitGrievance(session.userId, { title: field(form,"title"), category: field(form,"category"), severity: field(form,"severity"), sensitive: form.get("sensitive") === "on", details: field(form,"details"), state: field(form,"state"), district: field(form,"district"), centre: field(form,"centre") });
      revalidatePath("/sites/skillcity/gateway"); revalidatePath("/gateway");
      return { message: `Grievance ${reference} was received.` };
    }
    if (field(form, "action") === "GRIEVANCE_UPDATE") {
      const due = field(form,"dueAt");
      await startupRecordsGrievancesDesk.updateGrievance(session.userId, { id: field(form,"id"), version: field(form,"version"), action: field(form,"grievanceAction"), assignedUserId: field(form,"assignedUserId"), dueAt: due ? new Date(due).toISOString() : field(form,"grievanceAction") === "ASSIGN" ? "" : undefined, status: field(form,"status") || undefined, note: field(form,"note"), resolution: field(form,"resolution") });
      revalidatePath("/sites/skillcity/gateway"); revalidatePath("/gateway");
      return { message: "Grievance update saved to its case history." };
    }
    if (field(form, "action") === "CENTRE_PROPOSE") {
      const files = form.getAll("documents").filter((value): value is File => value instanceof File && value.size > 0).map(async file => ({ name: file.name, type: file.type, bytes: new Uint8Array(await file.arrayBuffer()) }));
      await startupCentreDesk.propose(session.userId, { name: field(form, "name"), type: field(form, "type"), state: field(form, "state"), district: field(form, "district"), proposedLocation: field(form, "proposedLocation"), tenure: field(form, "tenure"), commitmentDetails: field(form, "commitmentDetails"), expectedSetupCost: field(form, "expectedSetupCost"), expectedRecurringCost: field(form, "expectedRecurringCost"), leaseTerm: field(form, "leaseTerm"), expectedOpeningDate: field(form, "expectedOpeningDate"), propertyEndDate: field(form, "propertyEndDate"), centreManagerUserId: field(form, "centreManagerUserId"), notes: field(form, "notes") }, await Promise.all(files));
      revalidatePath("/sites/skillcity/gateway"); revalidatePath("/gateway");
      return { message: "Centre proposal saved as pending review. It is not approved for a rent, lease or purchase commitment." };
    }
    if (field(form, "action") === "CENTRE_TRANSITION") {
      await startupCentreDesk.transition(session.userId, { id: field(form, "id"), version: field(form, "version"), status: field(form, "status"), reason: field(form, "reason"), readinessNote: field(form, "readinessNote") });
      revalidatePath("/sites/skillcity/gateway"); revalidatePath("/gateway");
      return { message: "Centre lifecycle updated and recorded in its history." };
    }
    if (field(form, "action") === "CENTRE_ADD_TASK") {
      await startupCentreDesk.addSetupTask(session.userId, { id: field(form, "id"), version: field(form, "version"), title: field(form, "taskTitle"), owner: field(form, "taskOwner"), dueAt: field(form, "taskDueAt") ? new Date(field(form, "taskDueAt")).toISOString() : "" });
      revalidatePath("/sites/skillcity/gateway"); revalidatePath("/gateway");
      return { message: "Setup task added." };
    }
    if (field(form, "action") === "CENTRE_COMPLETE_TASK") {
      await startupCentreDesk.completeSetupTask(session.userId, { id: field(form, "id"), version: field(form, "version"), taskId: field(form, "taskId") });
      revalidatePath("/sites/skillcity/gateway"); revalidatePath("/gateway");
      return { message: "Setup task marked complete." };
    }
    if (field(form, "action") === "SUBMIT") {
      const files = form.getAll("attachments").filter((value): value is File => value instanceof File && value.size > 0).map(async file => ({ name: file.name, type: file.type, bytes: new Uint8Array(await file.arrayBuffer()) }));
      await startupOperationsDesk.submit(session.userId, { kind: field(form, "kind"), title: field(form, "title"), details: field(form, "details"), department: field(form, "department"), state: field(form, "state"), district: field(form, "district"), centre: field(form, "centre"), dueAt: field(form, "dueAt") ? new Date(field(form, "dueAt")).toISOString() : "", amount: field(form, "amount") }, await Promise.all(files));
      revalidatePath("/sites/skillcity/gateway"); revalidatePath("/gateway");
      return { message: "Submitted to the Startup Skool Work Inbox." };
    }
    if (field(form, "action") === "UPDATE") {
      await startupOperationsDesk.transition(session.userId, { id: field(form, "id"), version: field(form, "version"), status: field(form, "status"), reason: field(form, "reason") });
      revalidatePath("/sites/skillcity/gateway"); revalidatePath("/gateway");
      return { message: "Inbox item updated and added to its decision history." };
    }
    return { error: "Choose a valid Work Inbox action." };
  } catch (error) {
    return { error: error instanceof Error ? error.message.slice(0, 220) : "Unable to save this item. Please try again." };
  }
}
