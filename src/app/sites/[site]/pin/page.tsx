import Link from "next/link";
import { redirect,notFound } from "next/navigation";
import { requestPortal } from "@/server/portals/request";
import { getPortalSession } from "@/server/portals/session";
import { LabsForm } from "../../labs-ui/form";
export default async function PinPage({params}:{params:Promise<{site:string}>}){const {site,paths}=await requestPortal((await params).site);if(site.id!=="labs")notFound();const session=await getPortalSession(site);if(!session)redirect(paths.login);return <main className="portal-login portal-labs"><Link className="al-brand" href={paths.home}>AIRA Labs</Link><section className="portal-login-panel"><h1>Change your PIN</h1><p>{session.email}</p><p>Choose a different six-digit PIN. Your current sessions will be signed out.</p><LabsForm kind="PIN" label="Change PIN">{[["currentPin","Current PIN"],["newPin","New PIN"],["confirmPin","Confirm new PIN"]].map(([name,label])=><label key={name}>{label}<input type="password" name={name} inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} required autoComplete={name==="currentPin"?"current-password":"new-password"}/></label>)}</LabsForm></section></main>;}
