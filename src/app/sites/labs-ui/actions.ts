"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requestPortal } from "@/server/portals/request";
import { getPortalSession, revokePortalSession } from "@/server/portals/session";
import { labsService } from "@/server/labs/service";
import { labsPin } from "@/server/labs/pin";
import { labsCustomerService } from "@/server/labs/customer";
import { AccessError } from "@/server/authorization/engine";
import { ZodError } from "zod";
import { consumeSecurityBudget, securityKey, RateLimitError } from "@/server/security/rate-limit";
import { safeDiagnostic } from "@/server/security/diagnostics";
export type LabsState = { error?: string; message?: string };
const text = (form: FormData, key: string) => String(form.get(key) ?? "");
export async function enquiryAction(_state: LabsState, form: FormData): Promise<LabsState> {
  await requestPortal("labs", true);
  try {
    await consumeSecurityBudget("labs:enquiry:global", 30, 60);
    await consumeSecurityBudget(securityKey("labs:enquiry:contact", text(form, "email").trim().toLowerCase()), 3, 3600);
    if (text(form,"website")) return { message: "Thank you. Your enquiry has been recorded for review." };
    await labsService.enquire({ company: text(form,"company"), name: text(form,"name"), email: text(form,"email"), phone: text(form,"phone"), need: text(form,"need"), source: "WEBSITE", consent: form.get("consent") === "on" });
    return { message: "Thank you. Your enquiry has been recorded for review. No appointment is confirmed yet." };
  } catch(error) {
    if(error instanceof AccessError || error instanceof RateLimitError) return {error:error.message};
    if(error instanceof ZodError) return {error:"Enter your business, name, valid email and business need, and confirm the enquiry notice."};
    safeDiagnostic("operation_failed"); return {error:"Could not record your enquiry. Please try again later."};
  }
}
export async function labsAction(_state: LabsState, form: FormData): Promise<LabsState> {
  const {site,paths}=await requestPortal("labs",true), session=await getPortalSession(site);
  if(!session || session.needsPinChange)return {error:"Sign in and change your initial PIN before continuing."};
  try {
    await consumeSecurityBudget(securityKey("labs:action",session.userId),60,60);
    const base={id:text(form,"id"),version:Number(text(form,"version")),reference:text(form,"reference")};
    switch(text(form,"action")) {
      case "CREATE_LEAD": {const lead=await labsService.createLead(session.userId,{company:text(form,"company"),name:text(form,"name"),email:text(form,"email"),phone:text(form,"phone"),need:text(form,"need"),source:"MANUAL",consent:form.get("consent")==="on"});revalidatePath(paths.gateway);return {message:lead.duplicate?"Saved. Existing lead reused; no contact details were changed.":"Saved. Lead created."};}
      case "ASSIGN_ENQUIRY": await labsService.assignEnquiry(session.userId,text(form,"id"),text(form,"ownerUserId"));break;
      case "ASSIGN": await labsService.assign(session.userId,{...base,ownerUserId:text(form,"ownerUserId")});break;
      case "UPDATE": await labsService.updateLead(session.userId,{...base,status:text(form,"status"),outcome:text(form,"outcome"),qualification:text(form,"qualification"),nextFollowUp:text(form,"nextFollowUp")||null});break;
      case "QUOTE": await labsService.quote(session.userId,{leadId:base.id,currency:text(form,"currency"),items:[{description:text(form,"description"),quantity:text(form,"quantity"),rate:text(form,"rate")}],discount:text(form,"discount"),taxBasisPoints:Number(text(form,"taxBasisPoints")),expiresAt:text(form,"expiresAt")},base.reference);break;
      case "SUBMIT_QUOTE":await labsService.submitQuote(session.userId,base);break;
      case "APPROVE":case "REJECT":await labsService.decideQuote(session.userId,base.id,text(form,"action")==="APPROVE"?"APPROVED":"REJECTED",text(form,"comment"));break;
      case "ISSUE":await labsService.issue(session.userId,base);break;
      case "ACCEPT":await labsService.accept(session.userId,{...base,evidence:text(form,"evidence")});break;
      case "PROJECT":await labsService.startProject(session.userId,{...base,scope:text(form,"scope"),developerUserId:text(form,"developerUserId"),targetDate:text(form,"targetDate")});break;
      case "DELIVER":await labsService.deliver(session.userId,{projectId:base.id,stage:text(form,"stage"),reviewEvidence:text(form,"reviewEvidence"),acceptanceEvidence:text(form,"acceptanceEvidence"),reference:base.reference});break;
      case "TASK":await labsService.saveTask(session.userId,{projectId:base.id,...(text(form,"taskId")?{taskId:text(form,"taskId")}:{}),title:text(form,"title"),description:text(form,"description"),dueDate:text(form,"dueDate"),status:text(form,"status"),reference:base.reference});break;
      case "PROCESS_DUE":{const result=await labsService.processFollowups(session.userId);revalidatePath(paths.gateway);return {message:`Processed ${result.succeeded} due items; ${result.failures.length} failed. No external delivery is confirmed.`,...(result.failures.length?{error:"Review failed reminders and reschedule after correcting the source or recipient."}:{})};}
      case "GRANT_CUSTOMER": await labsCustomerService.grant(session.userId,{leadId:base.id,customerEmail:text(form,"customerEmail"),evidence:text(form,"evidence")});break;
      case "REVOKE_CUSTOMER": await labsCustomerService.revoke(session.userId,base.id);break;
      default: return {error:"Action unavailable"};
    }
    revalidatePath(paths.gateway);return {message:"Saved. The current record has been refreshed."};
  }catch(error){if(error instanceof AccessError || error instanceof RateLimitError)return {error:error.message};if(error instanceof ZodError)return {error:"Check the required fields and dates, then try again."};safeDiagnostic("operation_failed");return {error:"Could not save. Refresh the record before retrying; no success is confirmed."};}
}
export async function changeLabsPinAction(_state:LabsState,form:FormData):Promise<LabsState>{
  const {site,paths}=await requestPortal("labs",true),session=await getPortalSession(site);if(!session)return {error:"Sign in again before changing your PIN."};
  try{await labsPin.rotate(session.userId,{currentPin:text(form,"currentPin"),newPin:text(form,"newPin"),confirmPin:text(form,"confirmPin")});await revokePortalSession(site);}catch(error){if(!(error instanceof ZodError || error instanceof AccessError || error instanceof RateLimitError))safeDiagnostic("operation_failed");return {error:"Could not change PIN. Check the current PIN and choose a different matching six-digit PIN."};}
  redirect(paths.login);
}
