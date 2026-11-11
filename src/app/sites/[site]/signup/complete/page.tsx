import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";
import { requestPortal } from "@/server/portals/request";
import { getPortalSession } from "@/server/portals/session";
import styles from "../../../jobs-ui/auth.module.css";

export const metadata = { title: "Welcome to NICEJOBS!", robots: { index: false, follow: false } };
export default async function RegistrationComplete({ params }: { params: Promise<{ site: string }> }) {
  const { site, paths } = await requestPortal((await params).site); if (site.id !== "jobs") notFound();
  const session = await getPortalSession(site); if (!session) redirect(paths.login);
  return <main className="portal-login portal-jobs"><section className={styles.formContent}>
    <p className={styles.eyebrow}><Check size={16} aria-hidden="true"/> ACCOUNT READY</p><h1>Welcome to NICEJOBS!</h1><p className={styles.description}>Your email is verified and your account is ready.</p>
    <Link className={styles.button} href={`${paths.signup}/about-you`}>Continue <ArrowRight size={18}/></Link>
  </section></main>;
}
