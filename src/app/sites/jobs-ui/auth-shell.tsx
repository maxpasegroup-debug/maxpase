import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, BriefcaseBusiness } from "lucide-react";
import type { ReactNode } from "react";
import styles from "./auth.module.css";

export type JobsAuthPaths = { home: string; login: string; signup: string };

export function JobsAuthShell({ paths, title, eyebrow, description, mode, children }: {
  paths: JobsAuthPaths;
  title: string;
  eyebrow: string;
  description: string;
  mode: "signup" | "login" | "reset" | "verify";
  children: ReactNode;
}) {
  return <main className={`${styles.page} ${mode === "signup" ? styles.signupPage : ""}`}>
    <aside className={styles.story} aria-label="Nice Jobs">
      <Image className={styles.storyImage} src="/images/nice-jobs-hero-v2.webp" alt="" fill sizes="(max-width: 900px) 100vw, 48vw" priority />
      <div className={styles.storyContent}>
        <p>AIRA CAREER HUB</p>
        <h2>Good things start with a first step.</h2>
        <span>Discover opportunities. Learn the work. Grow through practice.</span>
      </div>
    </aside>
    <div className={styles.content}>
      <header className={styles.header}>
        <Link className={styles.brand} href={paths.home} aria-label="Nice Jobs home"><span className={styles.brandMark}><BriefcaseBusiness size={21} /></span><span>Nice Jobs<small>AIRA Career Hub</small></span></Link>
        <nav aria-label="Account navigation"><Link aria-current={mode === "login" ? "page" : undefined} href={paths.login}>Sign in</Link><Link aria-current={mode === "signup" ? "page" : undefined} href={paths.signup}>Create account</Link></nav>
      </header>
      <div className={styles.formWrap}>
        <div className={styles.formContent} key={mode}>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h1>{title}</h1>
          <p className={styles.description}>{description}</p>
          {children}
        </div>
      </div>
      <footer className={styles.footer}><Link href={paths.home}><ArrowLeft size={16} /> Back to Nice Jobs</Link><span>Nice Jobs / AIRA Skill City Private Limited</span></footer>
    </div>
  </main>;
}
