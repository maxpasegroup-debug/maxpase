import { requestPortal } from "@/server/portals/request";
import { getPortalSession } from "@/server/portals/session";
import { labsService } from "@/server/labs/service";
import { buildQuotationPdf } from "@/server/labs/quotation-pdf";
import { AccessError } from "@/server/authorization/engine";
import { consumeSecurityBudget,securityKey } from "@/server/security/rate-limit";
import { safeDiagnostic } from "@/server/security/diagnostics";
const headers={"Cache-Control":"private, no-store, max-age=0","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; sandbox","Cross-Origin-Resource-Policy":"same-origin","Referrer-Policy":"no-referrer"};
export async function GET(_request:Request,{params}:{params:Promise<{site:string;id:string}>}){
  const p=await params,{site}=await requestPortal(p.site);if(site.id!=="labs")return new Response("Not found",{status:404,headers});
  const session=await getPortalSession(site);if(!session||session.needsPinChange)return new Response("Sign in required",{status:401,headers});
  try{
    await consumeSecurityBudget(securityKey("labs:document",session.userId),30,60);
    if(!/^[a-zA-Z0-9_-]{1,120}$/.test(p.id))return new Response("Not found",{status:404,headers});
    const document=await labsService.quoteDocument(session.userId,p.id),body=buildQuotationPdf(document);
    return new Response(new Uint8Array(body),{headers:{...headers,"Content-Type":"application/pdf","Content-Length":String(body.length),"Content-Disposition":`attachment; filename="aira-labs-quotation-${document.row.id}.pdf"`}});
  }catch(error){if(!(error instanceof AccessError))safeDiagnostic("operation_failed");return new Response("Document unavailable",{status:404,headers});}
}
