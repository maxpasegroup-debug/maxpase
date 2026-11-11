import type { Metadata } from "next";
import Link from "next/link";
import { requestPortal } from "@/server/portals/request";
import { NICEJOBS_TERMS_VERSION } from "@/server/nicejobs/legal-versions";
import styles from "../../jobs-ui/legal.module.css";
import { AiraPublicLegalPage } from "../../skillcity-ui/public-legal-page";
import { notFound } from "next/navigation";

export async function generateMetadata({ params }: { params: Promise<{ site: string }> }): Promise<Metadata> {
  const { site } = await requestPortal((await params).site);
  if (site.id === "skillcity") return { title: "Terms of Use | AIRA Skill City", description: "Terms for the AIRA Skill City public website, enquiries and programme services." };
  if (site.id === "jobs") return { title: "Terms & Conditions | Nice Jobs", description: "Terms for using the Nice Jobs account and opportunity service." };
  notFound();
}

export default async function NiceJobsTerms({ params }: { params: Promise<{ site: string }> }) {
  const { site, paths } = await requestPortal((await params).site);
  if (site.id === "skillcity") return <AiraPublicLegalPage kind="terms" home={paths.home} />;
  if (site.id !== "jobs") notFound();
  return <main className={styles.page}><Link className={styles.brand} href={paths.home}>Nice Jobs</Link><article className={styles.article}>
    <p className={styles.eyebrow}>VERSION {NICEJOBS_TERMS_VERSION}</p><h1>Terms &amp; Conditions</h1><p>Effective 9 November 2026</p>
    <h2>Using Nice Jobs</h2><p>Nice Jobs is a service of AIRA Skill City Private Limited. You must provide accurate account details, protect your sign-in credentials and use the service lawfully. Do not impersonate another person, interfere with the service or submit information you are not authorized to share.</p>
    <h2>Opportunities and applications</h2><p>Creating an account does not create an employment relationship, guarantee an application outcome, job, work, payment or income. Each published opportunity has its own eligibility, responsibilities and terms. You can decide whether to apply after reviewing them.</p>
    <h2>Your account</h2><p>You are responsible for activity performed using your account. Contact Nice Jobs through the service if you believe your account has been used without your permission. Access may be limited when needed to protect accounts, people or the service, or to meet legal obligations.</p>
    <h2>Changes and questions</h2><p>These terms may be updated. When a material update requires renewed consent, Nice Jobs will ask you to review the current version. Continuing to use a feature remains subject to its displayed terms.</p>
    <p><Link href={`${paths.home}/privacy`}>Read the Privacy Policy</Link></p><p><Link href={paths.signup}>Return to registration</Link></p>
  </article></main>;
}
