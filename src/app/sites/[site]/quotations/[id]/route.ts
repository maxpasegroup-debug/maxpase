import { requestPortal } from "@/server/portals/request";
import { getPortalSession } from "@/server/portals/session";
import { labsService } from "@/server/labs/service";
import { AccessError } from "@/server/authorization/engine";
import { consumeSecurityBudget,securityKey } from "@/server/security/rate-limit";
import { safeDiagnostic } from "@/server/security/diagnostics";
const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
const headers={"Cache-Control":"private, no-store, max-age=0","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; sandbox","Cross-Origin-Resource-Policy":"same-origin","Referrer-Policy":"no-referrer"};
export async function GET(_request:Request,{params}:{params:Promise<{site:string;id:string}>}){
  const p=await params,{site}=await requestPortal(p.site);if(site.id!=="labs")return new Response("Not found",{status:404,headers});
  const session=await getPortalSession(site);if(!session||session.needsPinChange)return new Response("Sign in required",{status:401,headers});
  try{
    await consumeSecurityBudget(securityKey("labs:document",session.userId),30,60);
    if(!/^[a-zA-Z0-9_-]{1,120}$/.test(p.id))return new Response("Not found",{status:404,headers});
    const {row,data}=await labsService.quoteDocument(session.userId,p.id);
    const body=`<!doctype html><html lang="en"><meta charset="utf-8"><title>AIRA Labs quotation</title><body><h1>AIRA Labs</h1><h2>Quotation Q-${escape(row.id.toUpperCase())}</h2><p>Status: ${escape(row.status)}</p><p>${data.issuer?escape(data.issuer.legalName)+" / "+escape(data.issuer.address):"Draft only. Issuer and tax verification not completed."}</p><table><thead><tr><th>Deliverable</th><th>Quantity</th><th>Unit rate</th></tr></thead><tbody>${data.input.items.map(i=>`<tr><td>${escape(i.description)}</td><td>${escape(i.quantity)}</td><td>${escape(i.rate)}</td></tr>`).join("")}</tbody></table><p>Subtotal: ${escape(data.totals.subtotal)}</p><p>Discount: ${escape(data.totals.discount)}</p><p>Tax: ${escape(data.totals.tax)}</p><p>Total: ${escape(data.input.currency)} ${escape(data.totals.total)}</p><p>Valid until: ${escape(data.input.expiresAt)}</p><p>This is a quotation, not an invoice, receipt or payment confirmation.</p></body></html>`;
    return new Response(body,{headers:{...headers,"Content-Type":"text/html; charset=utf-8","Content-Disposition":`attachment; filename="aira-labs-quotation-${row.id}.html"`}});
  }catch(error){if(!(error instanceof AccessError))safeDiagnostic("operation_failed");return new Response("Document unavailable",{status:404,headers});}
}
