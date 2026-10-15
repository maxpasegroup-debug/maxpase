import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(()=>({session:vi.fn(),portalSession:vi.fn(),portal:vi.fn(),headers:vi.fn(),budget:vi.fn(),preflight:vi.fn(),upload:vi.fn(),download:vi.fn()}));
vi.mock("next/headers",()=>({headers:mocks.headers}));
vi.mock("@/server/auth/session",()=>({getSession:mocks.session}));
vi.mock("@/server/portals/session",()=>({getPortalSession:mocks.portalSession}));
vi.mock("@/server/portals/request",()=>({requestPortal:mocks.portal}));
vi.mock("@/server/security/rate-limit",()=>({consumeSecurityBudget:mocks.budget,securityKey:(type:string,id:string)=>type+":"+id,RateLimitError:class extends Error{}}));
vi.mock("@/server/nicejobs/content-files",()=>({contentFiles:{preflight:mocks.preflight,upload:mocks.upload,download:mocks.download}}));
import { uploadContent,downloadContent } from "@/server/nicejobs/content-handler";
import { AccessError } from "@/server/authorization/engine";
const url="http://localhost:3010/api/nicejobs/content/upload";
beforeEach(()=>{
  vi.clearAllMocks();vi.stubEnv("APP_ORIGIN","http://localhost:3010");
  mocks.headers.mockResolvedValue(new Headers({host:"localhost:3010",origin:"http://localhost:3010"}));
  mocks.session.mockResolvedValue({userId:"real-session-user"});mocks.portalSession.mockResolvedValue({userId:"portal-user"});mocks.portal.mockResolvedValue({site:{id:"jobs"}});mocks.preflight.mockResolvedValue(undefined);
  mocks.upload.mockResolvedValue({id:"private-file",filename:"lesson.png",mime:"image/png",mediaType:"IMAGE",bytes:4,uploaderUserId:"secret-actor",digest:"private-digest"});
  mocks.download.mockResolvedValue({file:{filename:"lesson.png",mime:"image/png",mediaType:"IMAGE"},bytes:Buffer.from([1,2,3,4])});
});
afterEach(()=>vi.unstubAllEnvs());
const request=()=>new Request(url,{method:"POST",body:new Uint8Array([1,2,3,4]),headers:{"Content-Type":"image/png","x-file-name":"lesson.png","x-organization-id":"division","x-upload-key":crypto.randomUUID(),"x-user-id":"forged-user"}});
describe("Private content HTTP boundaries",()=>{
  it("uses session identity, checks permission before consuming bytes and returns only public upload metadata",async()=>{
    const response=await uploadContent(request(),false);expect(response.status).toBe(200);
    expect(mocks.preflight).toHaveBeenCalledWith("real-session-user","division");expect(mocks.upload.mock.calls[0][0]).toBe("real-session-user");
    const body=await response.text();expect(body).not.toContain("private-digest");expect(body).not.toContain("secret-actor");expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("rejects anonymous, unauthorized and cross-origin requests without a file effect",async()=>{
    mocks.session.mockResolvedValue(null);expect((await uploadContent(request(),false)).status).toBe(401);expect(mocks.upload).not.toHaveBeenCalled();
    mocks.session.mockResolvedValue({userId:"real-session-user"});mocks.preflight.mockRejectedValue(new AccessError("Denied"));expect((await uploadContent(request(),false)).status).toBe(403);expect(mocks.upload).not.toHaveBeenCalled();
    mocks.headers.mockResolvedValue(new Headers({host:"localhost:3010",origin:"https://attacker.invalid"}));expect((await uploadContent(request(),false)).status).not.toBe(200);expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("keeps portal and corporate sessions separate and rejects corporate paths on a portal host",async()=>{
    await uploadContent(request(),true);expect(mocks.upload.mock.calls[0][0]).toBe("portal-user");expect(mocks.session).not.toHaveBeenCalled();expect(mocks.portal).toHaveBeenCalledWith("jobs",true);
    mocks.headers.mockResolvedValue(new Headers({host:"nicejobs.online",origin:"https://nicejobs.online"}));expect((await uploadContent(request(),false)).status).toBe(403);
  });
  it("serves authenticated byte ranges with private security headers and rejects malformed ranges",async()=>{
    const response=await downloadContent(new Request("http://localhost:3010/api/nicejobs/content/version?preview=true",{headers:{range:"bytes=1-2"}}),"version",false);
    expect(response.status).toBe(206);expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([2,3]));expect(response.headers.get("content-range")).toBe("bytes 1-2/4");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");expect(response.headers.get("cache-control")).toBe("private, no-store");expect(response.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    expect((await downloadContent(new Request(url,{headers:{range:"bytes=1-2,3-4"}}),"version",false)).status).toBe(416);
  });
  it("does not inline PDFs or leak storage errors, and carries only a server-verified training reference",async()=>{
    mocks.download.mockResolvedValue({file:{filename:"policy.pdf",mime:"application/pdf",mediaType:"PDF"},bytes:Buffer.from([1])});
    const response=await downloadContent(new Request(url+"?preview=true&applicationReference=reference"),"version",false);
    expect(response.headers.get("content-disposition")).toContain("attachment");expect(mocks.download).toHaveBeenCalledWith("real-session-user","version",false,"reference");
    mocks.download.mockRejectedValue(new Error("SECRET-STORAGE-PATH"));const failure=await downloadContent(new Request(url),"version",false);expect(failure.status).toBe(503);expect(await failure.text()).not.toContain("SECRET");
  });
});
