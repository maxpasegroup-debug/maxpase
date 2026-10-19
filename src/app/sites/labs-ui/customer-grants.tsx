import { randomUUID } from "node:crypto";
import { AccessError } from "@/server/authorization/engine";
import { labsCustomerService } from "@/server/labs/customer";
import { LabsForm } from "./form";

export async function CustomerGrants({ userId, leadId, email }: { userId: string; leadId: string; email: string }) {
  const grants = await labsCustomerService.grantsForLead(userId, leadId).catch(error => { if (error instanceof AccessError) return null; throw error; });
  if (!grants) return null;
  return <section className="al-section"><h2>Customer access</h2><p>Grant only after verifying the existing account and recording how customer identity was confirmed. An email match alone is not authorization.</p><LabsForm actionName="GRANT_CUSTOMER" id={leadId} reference={randomUUID()} label="Grant verified access" confirm="Confirm this customer identity has been independently verified?"><input type="hidden" name="customerEmail" value={email}/><p>Account: {email}</p><label>Verification evidence<textarea name="evidence" minLength={10} maxLength={1000} required/></label></LabsForm>{grants.map(grant => <div key={grant.id}><p>{grant.customer.email}: {grant.status.toLowerCase()}</p>{grant.status === "ACTIVE" && <LabsForm actionName="REVOKE_CUSTOMER" id={grant.id} reference={randomUUID()} label="Revoke access" confirm="Revoke this customer account's access to the enquiry?"><p>This removes access immediately.</p></LabsForm>}</div>)}</section>;
}
