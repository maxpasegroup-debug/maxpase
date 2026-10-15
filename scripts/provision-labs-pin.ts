import { resolve,isAbsolute,relative } from "node:path";
import { PrismaClient } from "@prisma/client";
import { createLabsPin } from "../src/server/labs/pin";
import { createAuthenticationService } from "../src/server/auth/service";

// Local-only, explicitly confirmed existing-account provisioning. Never seed a PIN or role.
async function main(){
  const raw=process.env.DATABASE_URL??"",initialPin=process.env.AIRALABS_INITIAL_PIN??"",token=process.env.AIRALABS_OPERATOR_SESSION_TOKEN??"",secret=process.env.AUTH_SECRET??"",realm=process.env.AIRALABS_OPERATOR_SESSION_REALM??"corporate";
  if(process.env.NODE_ENV==="production"||process.env.AIRALABS_LOCAL_PROVISION_ENABLED!=="true"||!raw.startsWith("file:")||!isAbsolute(raw.slice(5))||!token||secret.length<32||!["corporate","labs"].includes(realm)||!/^[0-9]{6}$/.test(initialPin))throw new Error("Provisioning not authorized");
  const target=resolve(raw.slice(5)),root=resolve(".private"),inside=relative(root,target);
  if(inside.startsWith("..")||isAbsolute(inside)||!inside||process.env.AIRALABS_PROVISION_DATABASE_CONFIRMATION!==target)throw new Error("Local target not confirmed");
  const db=new PrismaClient({datasourceUrl:raw});
  try{const session=await createAuthenticationService(db).validate(token,secret,realm==="labs"?"labs":undefined);if(!session||session.needsPinChange)throw new Error("Authenticated operator required");const user=await db.user.findUnique({where:{email:"director@airalabs.online"},select:{id:true}});if(!user)throw new Error("Create and authorize the dedicated account through canonical people/access controls first");await createLabsPin(db).provision(session.userId,user.id,initialPin);process.stdout.write("PASS: existing authorized director credential provisioned; first-use change required; sessions revoked. No memberships or roles created.\n");}finally{await db.$disconnect();}
}
main().catch(()=>{process.stderr.write("BLOCKED: verify the confirmed isolated local target, authorized operator, dedicated director account and environment PIN. No success is claimed.\n");process.exitCode=1;});
