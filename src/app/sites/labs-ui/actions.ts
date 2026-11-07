"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requestPortal } from "@/server/portals/request";
import { getPortalSession, revokePortalSession } from "@/server/portals/session";
import { labsService } from "@/server/labs/service";
import { labsPin } from "@/server/labs/pin";
import { labsCustomerService } from "@/server/labs/customer";
import { labsBillingProfile } from "@/server/labs/billing-profile";
import { labsBillingOperations } from "@/server/labs/billing-operations";
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
      case "BILLING_PROFILE_SAVE": await labsBillingProfile.save(session.userId,{legalName:text(form,"legalName"),registeredAddress:text(form,"registeredAddress"),registeredState:text(form,"registeredState"),gstin:text(form,"gstin"),gstRegistrationStatus:text(form,"gstRegistrationStatus"),pan:text(form,"pan"),financialYear:text(form,"financialYear"),companyEmail:text(form,"companyEmail"),companyPhone:text(form,"companyPhone"),logoReference:text(form,"logoReference"),authorizedSignatory:text(form,"authorizedSignatory"),bankName:text(form,"bankName"),accountHolder:text(form,"accountHolder"),accountNumber:text(form,"accountNumber"),ifsc:text(form,"ifsc"),branch:text(form,"branch"),paymentInstructions:text(form,"paymentInstructions"),quotationTerms:text(form,"quotationTerms"),invoiceTerms:text(form,"invoiceTerms"),documentFooter:text(form,"documentFooter"),evidenceReferences:text(form,"evidenceReferences"),version:Number(text(form,"profileVersion"))});break;
      case "BILLING_LEGAL_VERIFY": await labsBillingProfile.verifyLegal(session.userId,text(form,"evidence"));break;
      case "BILLING_CA_REVIEW": { const rates=text(form,"approvedRates").split(",").map(value=>value.trim()).filter(Boolean).map(value=>Number(value)*100); await labsBillingProfile.reviewTax(session.userId,{serviceAndTaxEvidence:text(form,"serviceAndTaxEvidence"),approvedTaxBasisPoints:rates,eInvoiceStatus:text(form,"eInvoiceStatus"),eInvoiceEvidence:text(form,"eInvoiceEvidence")});break; }
      case "BILLING_CUSTOMER_CREATE": await labsBillingOperations.createCustomer(session.userId,{customerType:text(form,"customerType"),legalName:text(form,"legalName"),businessName:text(form,"businessName"),contactPerson:text(form,"contactPerson"),email:text(form,"email"),phone:text(form,"phone"),billingAddress:text(form,"billingAddress"),state:text(form,"state"),pinCode:text(form,"pinCode"),gstRegistrationStatus:text(form,"gstRegistrationStatus"),gstin:text(form,"gstin"),placeOfSupply:text(form,"placeOfSupply"),notes:text(form,"notes")});break;
      case "BILLING_SERVICE_CREATE": await labsBillingOperations.createService(session.userId,{category:text(form,"category"),name:text(form,"serviceName"),description:text(form,"description"),scope:text(form,"scope"),deliverables:text(form,"deliverables"),pricingBasis:text(form,"pricingBasis"),defaultPrice:text(form,"defaultPrice"),sacCode:text(form,"sacCode"),placeOfSupplyRule:text(form,"placeOfSupplyRule"),version:0});break;
      case "BILLING_SERVICE_APPROVE": await labsBillingOperations.approveServiceTax(session.userId,{serviceId:text(form,"serviceId"),gstBasisPoints:Number(text(form,"gstBasisPoints")),sacCode:text(form,"sacCode"),evidence:text(form,"taxEvidence")});break;
      case "BILLING_INVOICE_FROM_QUOTE": { const count=Number(text(form,"lineCount")), serviceIds=Array.from({length:count},(_,index)=>text(form,`serviceId_${index}`)); await labsBillingOperations.createInvoiceFromQuote(session.userId,{quoteId:text(form,"quoteId"),customerId:text(form,"customerId"),serviceIds,dueDate:text(form,"dueDate")||null});break; }
      case "BILLING_PAYMENT_RECORD": await labsBillingOperations.recordPayment(session.userId,{invoiceId:text(form,"invoiceId"),paymentDate:text(form,"paymentDate"),amount:text(form,"amount"),paymentMode:text(form,"paymentMode"),bankReference:text(form,"bankReference"),notes:text(form,"notes")});break;
      case "BILLING_PAYMENT_VERIFY": await labsBillingOperations.verifyPayment(session.userId,text(form,"paymentId"),text(form,"reconciliationEvidence"));break;
      case "BILLING_VENDOR_BILL_CREATE": await labsBillingOperations.createVendorBill(session.userId,{vendorName:text(form,"vendorName"),vendorGstin:text(form,"vendorGstin"),vendorInvoiceNumber:text(form,"vendorInvoiceNumber"),billDate:text(form,"billDate"),description:text(form,"description"),expenseCategory:text(form,"expenseCategory"),taxableAmount:text(form,"taxableAmount"),cgst:text(form,"cgst"),sgst:text(form,"sgst"),igst:text(form,"igst"),dueDate:text(form,"dueDate")||null});break;
      case "BILLING_VENDOR_BILL_APPROVE": await labsBillingOperations.approveVendorBill(session.userId,text(form,"vendorBillId"),text(form,"approvalEvidence"));break;
      case "BILLING_VENDOR_PAYMENT_RECORD": await labsBillingOperations.recordVendorPayment(session.userId,text(form,"vendorBillId"),text(form,"paymentDate"),text(form,"paymentReference"));break;
      case "BILLING_VENDOR_PAYMENT_VERIFY": await labsBillingOperations.verifyVendorPayment(session.userId,text(form,"vendorBillId"),text(form,"paymentEvidence"));break;
      case "CREATE_LEAD": {const lead=await labsService.createLead(session.userId,{company:text(form,"company"),name:text(form,"name"),email:text(form,"email"),phone:text(form,"phone"),need:text(form,"need"),source:"MANUAL",consent:form.get("consent")==="on"});revalidatePath(paths.gateway);return {message:lead.duplicate?"Saved. Existing lead reused; no contact details were changed.":"Saved. Lead created."};}
      case "ASSIGN_ENQUIRY": await labsService.assignEnquiry(session.userId,text(form,"id"),text(form,"ownerUserId"));break;
      case "ASSIGN": await labsService.assign(session.userId,{...base,ownerUserId:text(form,"ownerUserId")});break;
      case "UPDATE": await labsService.updateLead(session.userId,{...base,status:text(form,"status"),outcome:text(form,"outcome"),qualification:text(form,"qualification"),nextFollowUp:text(form,"nextFollowUp")||null});break;
      case "QUOTE": await labsService.quote(session.userId,{leadId:base.id,...(text(form,"serviceId")?{serviceId:text(form,"serviceId")}:{}),currency:text(form,"currency"),items:[{description:text(form,"description"),quantity:text(form,"quantity"),rate:text(form,"rate")}],discount:text(form,"discount"),taxBasisPoints:Number(text(form,"taxBasisPoints")||0),expiresAt:text(form,"expiresAt")},base.reference);break;
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
