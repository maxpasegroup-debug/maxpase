"use server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireSession } from "@/server/auth/guards";
import { AccessError } from "@/server/authorization/engine";
import { hrEmploymentService } from "@/server/group/hr-employment";
import { hrCompanyConfig } from "@/server/group/hr-company-config";
import { safeDiagnostic } from "@/server/security/diagnostics";

export type HrState = { message?: string; error?: string };
export async function hrAction(_state: HrState, form: FormData): Promise<HrState> {
  const session = await requireSession();
  const value = (key: string) => String(form.get(key) ?? "").trim();
  const optional = (key: string) => value(key) || undefined;
  try {
    switch (value("intent")) {
      case "create": await hrEmploymentService.create(session.userId, { companyId: value("companyId"), ...(optional("personId") ? { personId: value("personId") } : { displayName: value("displayName"), email: value("email"), linkExisting: value("linkExisting") === "on" }), designation: optional("designation"), employmentType: optional("employmentType"), joiningDate: optional("joiningDate") }); break;
      case "assign": await hrEmploymentService.addAssignment(session.userId, { employmentId: value("employmentId"), brandId: value("brandId"), departmentId: optional("departmentId"), managerPersonId: optional("managerPersonId"), designation: value("designation"), startDate: value("startDate"), decisionReference: value("decisionReference") }); break;
      case "employment": await hrEmploymentService.changeEmployment(session.userId, { employmentId: value("employmentId"), action: value("transition"), decisionReference: value("decisionReference"), designation: optional("designation"), employmentType: optional("employmentType"), joiningDate: optional("joiningDate") }); break;
      case "assignment": await hrEmploymentService.changeAssignment(session.userId, { assignmentId: value("assignmentId"), action: value("transition"), decisionReference: value("decisionReference"), nextBrandId: optional("nextBrandId"), designation: optional("designation"), departmentId: optional("departmentId"), managerPersonId: optional("managerPersonId") }); break;
      case "company-proposal": await hrCompanyConfig.saveProposal(session.userId, { companyId: value("companyId"), proposedPortalHost: optional("proposedPortalHost"), proposedSenderEmail: optional("proposedSenderEmail"), decisionReference: value("decisionReference") }); break;
      default: throw new AccessError("Unknown HR action");
    }
    revalidatePath("/app/boss/departments/hr");
    return { message: "HR record updated. Login access is unchanged." };
  } catch (error) {
    if (error instanceof AccessError) return { error: error.message };
    if (error instanceof ZodError) return { error: "Check the required fields and dates." };
    safeDiagnostic("operation_failed");
    return { error: "The HR change could not be saved." };
  }
}
