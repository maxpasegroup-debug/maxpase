import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, X } from "lucide-react";
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
  return <main className={`${styles.page} ${mode === "signup" ? styles.signupPage : ""} ${mode === "login" ? styles.loginPage : ""}`}>
    <aside className={styles.story} aria-label="Nice Jobs">
      <Image className={styles.storyImage} src="/images/nicejobs-cinematic-hero.webp" alt="" fill sizes="100vw" priority />
      <div className={styles.storyContent}>
        <p>NICEJOBS · CAREER HUB</p>
        <h2>Your next step starts here.</h2>
        <span>Explore in-house opportunities, gain practical experience and grow through guided work.</span>
      </div>
    </aside>
    <div className={styles.content}>
      <header className={styles.header}>
        <Link className={styles.brand} href={paths.home} aria-label="NICEJOBS home"><span className={styles.brandMark}>N</span><span>NICEJOBS<small>Career Hub by AIRA Skill City</small></span></Link>
        <nav aria-label="Account navigation"><Link aria-current={mode === "login" ? "page" : undefined} href={paths.login}>Sign in</Link><Link aria-current={mode === "signup" ? "page" : undefined} href={paths.signup}>Create account</Link></nav>
      </header>
      <div className={styles.formWrap}>
        <div className={styles.formContent} key={mode}>
          {mode === "login" && <Link className={styles.loginClose} href={paths.home} aria-label="Close sign in"><X size={19}/></Link>}
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
