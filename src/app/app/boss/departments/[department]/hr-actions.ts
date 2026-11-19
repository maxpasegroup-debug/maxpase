"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError, z } from "zod";
import { requireSession } from "@/server/auth/guards";
import { AccessError } from "@/server/authorization/engine";
import { hrEmploymentService } from "@/server/group/hr-employment";
import { hrCompanyConfig } from "@/server/group/hr-company-config";
import { hrAccess } from "@/server/group/hr-access";
import { createBossService } from "@/server/group/boss-service";
import { staffOnboardingService } from "@/server/skillcity/staff-onboarding";
import { staffInvite } from "@/server/skillcity/staff-invite";
import { skillCityRoleTemplates, resolveStaffRoleTemplate } from "@/server/skillcity/role-templates";
import { marketingDivisionSlug } from "@/server/group/brand-marketing-scope";
import { niceJobsDirectorInvite } from "@/server/auth/nicejobs-director-invite";
import { prisma } from "@/server/db";
import { failureReason, safeDiagnostic } from "@/server/security/diagnostics";

export type HrState = { message?: string; error?: string; employmentId?: string; inviteSent?: boolean; dashboardReady?: boolean; activationUrl?: string; shareMessage?: string; shareEmail?: string; removed?: boolean };
async function appoint(actorId: string, form: FormData): Promise<HrState> {
  const val = (key: string) => String(form.get(key) ?? "").trim();
  const data = z.object({ companyId: z.string().min(1), brandId: z.string().optional(), designation: z.string().trim().min(2).max(120), displayName: z.string().trim().min(2).max(200), email: z.email().max(254).transform(v => v.toLowerCase()), phone: z.string().trim().regex(/^\+?[0-9().\-\s]{7,24}$/), joiningDate: z.coerce.date(), reportToUserId: z.string().optional() }).strict().refine(input => input.designation === "Director" || !!input.reportToUserId, { path: ["reportToUserId"], message: "Choose who the employee reports to" }).parse({ companyId: val("companyId"), ...(val("brandId") ? { brandId: val("brandId") } : {}), designation: val("designation"), displayName: val("displayName"), email: val("email"), phone: val("phone"), joiningDate: val("joiningDate"), reportToUserId: val("reportToUserId") || undefined });
  const reference = "Boss HR appointment";
  if (data.designation === "NICEJOBS Director") throw new AccessError("NICEJOBS administration is managed from the Boss NICEJOBS module.");
  const reportingUserId = data.designation === "Director" ? actorId : data.reportToUserId!;
  if (data.designation === "Director") await createBossService(prisma).authority(actorId);
  let employmentId: string | undefined;
  try {
    const reportingPerson = await prisma.user.findUnique({ where: { id: reportingUserId }, select: { personId: true, status: true, emailVerifiedAt: true } });
    const bossReportsDirector = data.designation === "Director" && reportingUserId === actorId;
    if (!reportingPerson?.personId || reportingPerson.status !== "ACTIVE" || !bossReportsDirector && !reportingPerson.emailVerifiedAt) throw new AccessError("The reporting person must have an active account and employee profile. Other reporting people must also verify their email.");
    const requestedStartupAo = data.designation === "Administrative Officer" && !!data.brandId;
    if (requestedStartupAo) {
      const [startupBrand, startupDivision] = await Promise.all([
        prisma.brand.findFirst({ where: { id: data.brandId, organizationId: data.companyId, slug: "startup-school" }, select: { id: true } }),
        prisma.organization.findFirst({ where: { slug: "aira-startup-school", parentId: data.companyId, type: "DIVISION", status: "ACTIVE" }, select: { id: true } })
      ]);
      if (!startupBrand || !startupDivision) throw new AccessError("Startup Skool AO appointments must be assigned to the active Startup Skool work area.");
      const directorMembership = await prisma.membership.findFirst({
        where: {
          personId: reportingPerson.personId,
          organizationId: startupDivision.id,
          projectId: null,
          status: "ACTIVE",
          roles: { some: { role: { organizationId: startupDivision.id, key: "startup-division-director", status: "ACTIVE" } } }
        },
        select: { id: true }
      });
      if (!directorMembership) throw new AccessError("A Startup Skool Administrative Officer must report to an active Startup Skool Director.");
    }
    employmentId = await hrEmploymentService.create(actorId, { companyId: data.companyId, displayName: data.displayName, email: data.email, phone: data.phone, designation: data.designation, joiningDate: data.joiningDate, initialBrandIds: data.brandId ? [data.brandId] : [], ...(data.brandId ? { initialManagerPersonId: reportingPerson.personId } : {}), assignmentDecisionReference: data.brandId ? reference : undefined, activateImmediately: true, decisionReference: reference });
    const employee = await hrEmploymentService.get(actorId, employmentId);
    const assignment = employee.assignments.find(item => item.status === "ACTIVE");
    const scopeSlug = assignment ? marketingDivisionSlug(assignment.brand.slug) : "aira-skill-city";
    if (!scopeSlug) throw new AccessError("The selected team does not have an employee dashboard yet.");
    const roleSpec = resolveStaffRoleTemplate(scopeSlug, data.designation);
    const preparedRole = await skillCityRoleTemplates.ensureForAppointment(actorId, data.companyId, roleSpec.scopeSlug, roleSpec.roleKey);
    const target = await prisma.organization.findUnique({ where: { id: preparedRole.organizationId }, select: { id: true, name: true } });
    if (!target) throw new AccessError("The employee workspace could not be prepared.");
    let delivery: { sent: boolean; activationUrl?: string } = { sent: false };
    if (data.designation === "NICEJOBS Director") {
      const nationalNumber = data.phone.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
      const appointment = await hrAccess.prepareNiceJobsDirector(actorId, { employmentId, organizationId: target.id, roleId: preparedRole.roleId, country: "IN", nationalNumber, decisionReference: reference });
      delivery = await niceJobsDirectorInvite.send(actorId, { userId: appointment.userId });
    } else {
    const draft = await staffOnboardingService.prepare(actorId, { organizationId: target.id, existingPersonId: employee.person.id, roleId: preparedRole.roleId, managerUserId: reportingUserId, managerDecisionReference: reference, scopeDecisionReference: reference });
      if (staffInvite.deliveryReady()) delivery = await staffInvite.send(actorId, { userId: draft.id, verificationEvidence: "Boss-approved appointment recorded in HR." });
    }
    revalidatePath("/app/boss/departments/hr");
    revalidatePath("/app/boss/departments/hr/employees/" + encodeURIComponent(employmentId));
    const activationUrl = delivery.activationUrl;
    const assignedBrand = employee.assignments.find(item => item.status === "ACTIVE")?.brand.name;
    const workArea = assignedBrand === "Startup School" ? "Startup Skool" : assignedBrand ?? employee.company.name;
    const shareMessage = activationUrl ? `Hello ${data.displayName}, your ${data.designation} workspace with ${workArea} is ready for setup. Start here: ${activationUrl}. We have emailed your verification code to ${data.email}. Enter that code on the setup page and create your own sign-in credential. Please do not share your verification code.` : undefined;
    return { employmentId, inviteSent: delivery.sent, dashboardReady: true, activationUrl, shareMessage, shareEmail: data.email, message: delivery.sent ? "Employee and role-based dashboard are set up. The employee activates sign-in by verifying their email and creating their own credential." : "Employee and role-based dashboard are set up. Email delivery is not configured yet, so sign-in stays inactive until secure setup email can be sent and verified." };
  } catch (error) {
    if (employmentId) { revalidatePath("/app/boss/departments/hr"); return { employmentId, message: "The employee record is saved. Dashboard access remains pending until the setup invitation is completed.", error: error instanceof AccessError ? error.message : "Setup access could not be prepared. Open the employee record to review it." }; }
    throw error;
  }
}

export async function hrAction(_state: HrState, form: FormData): Promise<HrState> {
  const session = await requireSession();
  const value = (key: string) => String(form.get(key) ?? "").trim();
  const optional = (key: string) => value(key) || undefined;
  let removedRedirect: string | undefined;
  let employmentId: string | undefined;
  try {
    if (value("intent") === "appoint") return await appoint(session.userId, form);
    switch (value("intent")) {
      case "connect-dashboard": {
        employmentId = value("employmentId");
        const employee = await hrEmploymentService.get(session.userId, employmentId);
        const company = await prisma.organization.findUnique({ where: { id: employee.companyId }, select: { slug: true } });
        if (company?.slug !== "aira-skill-city" || employee.status !== "ACTIVE" || !employee.person.email) throw new AccessError("An active AIRA Skill City employee with a work email is required");
        let linked = await prisma.user.findFirst({ where: { personId: employee.person.id }, select: { id: true, status: true, passwordHash: true, emailVerifiedAt: true, person: { select: { metadata: true } } } });
        if (linked?.status === "ACTIVE") throw new AccessError("This employee already has an active account");
        if (linked) {
          let metadata: Record<string, unknown>;
          try { metadata = JSON.parse(linked.person?.metadata ?? "{}"); } catch { throw new AccessError("This existing account needs identity review; it was not changed"); }
          if (linked.passwordHash || linked.emailVerifiedAt || metadata.authenticationRealm !== "skillcity" || !["DRAFT", "INVITED"].includes(String(metadata.staffOnboarding))) throw new AccessError("This existing account needs identity review; it was not changed");
          if (staffInvite.deliveryReady()) await staffInvite.send(session.userId, { userId: linked.id, verificationEvidence: "Boss-approved HR appointment recorded in HR." });
        } else {
          const assignment = employee.assignments.find(row => row.status === "ACTIVE");
          const scopeSlug = assignment ? marketingDivisionSlug(assignment.brand.slug) : "aira-skill-city";
          if (!scopeSlug) throw new AccessError("This work area does not have an employee dashboard configured");
          const roleSpec = resolveStaffRoleTemplate(scopeSlug, assignment?.designation ?? employee.designation ?? "");
          const preparedRole = await skillCityRoleTemplates.ensureForAppointment(session.userId, employee.companyId, roleSpec.scopeSlug, roleSpec.roleKey);
          let managerUserId = session.userId;
          if (!["Director", "Division Director"].includes(roleSpec.roleName)) {
            const managerPersonId = assignment?.managerPersonId;
            const manager = managerPersonId ? await prisma.user.findFirst({ where: { personId: managerPersonId, status: "ACTIVE", emailVerifiedAt: { not: null } }, select: { id: true } }) : null;
            if (!manager) throw new AccessError("Choose an active, verified reporting person on the employee's work assignment first");
            managerUserId = manager.id;
          }
          const draft = await staffOnboardingService.prepare(session.userId, { organizationId: preparedRole.organizationId, existingPersonId: employee.person.id, roleId: preparedRole.roleId, managerUserId, managerDecisionReference: "Boss-approved HR appointment", scopeDecisionReference: "Boss-approved HR appointment" });
          linked = { id: draft.id, status: "INACTIVE", passwordHash: null, emailVerifiedAt: null, person: { metadata: null } };
          if (staffInvite.deliveryReady()) await staffInvite.send(session.userId, { userId: linked.id, verificationEvidence: "Boss-approved HR appointment recorded in HR." });
        }
        revalidatePath("/app/boss/departments/hr");
        revalidatePath(`/app/boss/departments/hr/employees/${encodeURIComponent(employmentId)}`);
        return { employmentId, dashboardReady: true, inviteSent: staffInvite.deliveryReady(), message: staffInvite.deliveryReady() ? "Startup Skool dashboard role connected and secure setup email sent. The Director activates sign-in after verifying email and creating their own credential." : "Startup Skool dashboard role and pending account connected. Email delivery is not configured, so sign-in remains inactive until the secure setup email is sent and verified." };
      }
      case "create": employmentId = await hrEmploymentService.create(session.userId, { companyId: value("companyId"), ...(optional("personId") ? { personId: value("personId") } : { displayName: value("displayName"), email: value("email"), phone: optional("phone"), linkExisting: value("linkExisting") === "on" }), contactEmail: optional("contactEmail"), contactPhone: optional("contactPhone"), emergencyContactName: optional("emergencyContactName"), emergencyContactRelationship: optional("emergencyContactRelationship"), emergencyContactPhone: optional("emergencyContactPhone"), emergencyContactEmail: optional("emergencyContactEmail"), designation: optional("designation"), employmentType: optional("employmentType"), joiningDate: optional("joiningDate"), initialBrandIds: form.getAll("initialBrandIds").map(String), initialDepartmentId: optional("initialDepartmentId"), initialManagerPersonId: optional("initialManagerPersonId"), assignmentDecisionReference: optional("assignmentDecisionReference") }); break;
      case "assign": await hrEmploymentService.addAssignment(session.userId, { employmentId: value("employmentId"), brandId: value("brandId"), departmentId: optional("departmentId"), managerPersonId: optional("managerPersonId"), designation: value("designation"), startDate: value("startDate"), decisionReference: value("decisionReference") }); break;
      case "employment": await hrEmploymentService.changeEmployment(session.userId, { employmentId: value("employmentId"), action: value("transition"), decisionReference: value("decisionReference"), designation: optional("designation"), employmentType: optional("employmentType"), joiningDate: optional("joiningDate") }); break;
      case "remove-employee": {
        const result = await hrEmploymentService.removeEmployee(session.userId, { employmentId: value("employmentId"), mode: value("mode"), confirmation: value("confirmation") });
        revalidatePath("/app/boss/departments/hr");
        const notice = result.mode === "permanent" ? "employee-deleted" : "employee-archived";
        removedRedirect = `/app/boss/departments/hr?view=people&companyId=${encodeURIComponent(result.companyId)}&notice=${notice}`;
        break;
      }
      case "assignment": await hrEmploymentService.changeAssignment(session.userId, { assignmentId: value("assignmentId"), action: value("transition"), decisionReference: value("decisionReference"), nextBrandId: optional("nextBrandId"), designation: optional("designation"), departmentId: optional("departmentId"), managerPersonId: optional("managerPersonId") }); break;
      case "company-proposal": await hrCompanyConfig.saveProposal(session.userId, { companyId: value("companyId"), proposedPortalHost: optional("proposedPortalHost"), proposedSenderEmail: optional("proposedSenderEmail"), decisionReference: value("decisionReference") }); break;
      default: throw new AccessError("Unknown HR action");
    }
    revalidatePath("/app/boss/departments/hr");
  } catch (error) {
    if (error instanceof AccessError) return { error: error.message };
    if (error instanceof ZodError) return { error: "Check the required fields and dates." };
    const rawCode = error && typeof error === "object" && "code" in error ? error.code : undefined;
    const prismaCode = typeof rawCode === "string" && /^P\d{4}$/.test(rawCode) ? rawCode : undefined;
    const errorName = error instanceof Error ? error.name.slice(0, 80) : "UnknownError";
    const reference = safeDiagnostic("operation_failed", undefined, { stage: "readiness", reason: failureReason(error, "readiness"), errorName, ...(prismaCode ? { prismaCode } : {}) });
    const message = prismaCode === "P2002"
      ? "This email or employee record may already exist. Check the employee list before trying again."
      : prismaCode === "P2021" || prismaCode === "P2022"
        ? "The HR database setup is incomplete. The system owner must finish the database update before adding employees."
        : prismaCode === "P1000" || prismaCode === "P1001" || prismaCode === "P1003"
          ? "The application could not connect to its database. Please retry after service is restored."
          : "The appointment could not be saved. Share this support reference with the system owner.";
    return { error: `${message} Reference: ${reference}` };
  }
  const redirectTarget = removedRedirect;
  if (typeof redirectTarget === "string") redirect(redirectTarget);
  return { message: employmentId ? "Employee record and selected brand assignments saved as drafts. Login access is pending." : "HR record updated. Login access is unchanged.", employmentId };
}
