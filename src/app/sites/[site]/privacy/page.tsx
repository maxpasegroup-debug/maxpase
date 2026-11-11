import type { Metadata } from "next";
import Link from "next/link";
import { requestPortal } from "@/server/portals/request";
import { NICEJOBS_PRIVACY_VERSION } from "@/server/nicejobs/legal-versions";
import styles from "../../jobs-ui/legal.module.css";
import { AiraPublicLegalPage } from "../../skillcity-ui/public-legal-page";
import { notFound } from "next/navigation";

export async function generateMetadata({ params }: { params: Promise<{ site: string }> }): Promise<Metadata> {
  const { site } = await requestPortal((await params).site);
  if (site.id === "skillcity") return { title: "Privacy Policy | AIRA Skill City", description: "How AIRA Skill City handles website, enquiry, account, programme and payment-related information." };
  if (site.id === "jobs") return { title: "Privacy Policy | Nice Jobs", description: "Privacy information for Nice Jobs accounts, applications and opportunities." };
  notFound();
}

export default async function NiceJobsPrivacy({ params }: { params: Promise<{ site: string }> }) {
  const { site, paths } = await requestPortal((await params).site);
  if (site.id === "skillcity") return <AiraPublicLegalPage kind="privacy" home={paths.home} />;
  if (site.id !== "jobs") notFound();
  return <main className={styles.page}><Link className={styles.brand} href={paths.home}>Nice Jobs</Link><article className={styles.article}>
    <p className={styles.eyebrow}>VERSION {NICEJOBS_PRIVACY_VERSION}</p><h1>Privacy Policy</h1><p>Effective 9 November 2026</p>
    <h2>Who operates Nice Jobs</h2><p>Nice Jobs is operated by AIRA Skill City Private Limited through AIRA Career Hub. This policy describes information collected when you create and use a Nice Jobs account.</p>
    <h2>Information we use</h2><p>Registration collects your name, mobile number and email address. We also keep account identifiers, email verification and security events, your hashed PIN, consent records and information you submit in applications or while using the service. We do not store your PIN in readable form.</p>
    <h2>Why we use it</h2><p>We use this information to create and secure your account, verify your email, provide account recovery, operate applications and opportunities, communicate about your account, prevent misuse and meet applicable obligations.</p>
    <h2>Service providers and access</h2><p>Authorized Nice Jobs personnel and service providers may process information only as needed to operate, secure or support the service. Email verification codes are sent through the configured email delivery provider. Information may also be disclosed where required by law or needed to protect people and the service.</p>
    <h2>Security and retention</h2><p>We use access controls and security measures designed to protect account information. No online service can promise absolute security. We keep information for as long as needed to operate the service, resolve account or application matters, prevent abuse and meet legal requirements, then delete or de-identify it where appropriate.</p>
    <h2>Your choices</h2><p>You can keep your email current and contact Nice Jobs through the service with questions or requests about your information. We may need to verify your identity and retain some records where the law requires or permits it.</p>
    <p><Link href={`${paths.home}/terms`}>Read the Terms &amp; Conditions</Link></p><p><Link href={paths.signup}>Return to registration</Link></p>
  </article></main>;
}
