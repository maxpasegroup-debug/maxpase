import Image from "next/image";
import Link from "next/link";
import { ArrowDown, BriefcaseBusiness, GraduationCap, Layers, TrendingUp } from "lucide-react";
import type { portalPaths } from "@/server/portals/sites";
import styles from "./landing.module.css";
import { StartNow } from "./start-now";
import { JobsLandingMotion } from "./landing-motion";

type Paths = ReturnType<typeof portalPaths>;

const heroBenefits = [
  { label: "Learn with Guidance", icon: GraduationCap },
  { label: "Work on Real Tasks", icon: BriefcaseBusiness },
  { label: "Build Practical Skills", icon: Layers },
  { label: "Grow Your Earning Potential", icon: TrendingUp }
] as const;

const experienceBenefits = [
  { title: "Learn", description: "Get guided training and mentorship from experienced professionals.", icon: GraduationCap },
  { title: "Do", description: "Work on real tasks and contribute to actual business projects.", icon: BriefcaseBusiness },
  { title: "Earn", description: "Receive performance-based incentives for verified work and results.", icon: Layers },
  { title: "Grow", description: "Build your skills, confidence and future career opportunities.", icon: TrendingUp }
] as const;

const closingBenefits = [
  { label: "Real Work Experience", icon: BriefcaseBusiness },
  { label: "In-House Opportunities", icon: Layers },
  { label: "Performance-Based Earning Potential", icon: TrendingUp }
] as const;

export function JobsLanding({ paths }: { paths: Paths; opportunities?: unknown[]; availability?: "ready" | "unavailable" }) {
  const siteBase = paths.home === "/" ? "" : paths.home.replace(/\/$/, "");
  return <main className={styles.page} data-jobs-landing="" data-active-section="hero">
    <JobsLandingMotion />
    <header className={styles.header} data-site-header="">
      <div className={styles.headerInner}>
        <Link className={styles.brand} href={paths.home} aria-label="NICEJOBS home">
          <span className={styles.brandMark} aria-hidden="true">N</span>
          <span className={styles.brandName}>NICEJOBS</span>
        </Link>
        <nav className={styles.nav} aria-label="Main navigation">
          <Link className={styles.signIn} href={paths.login}>Sign In</Link>
          <StartNow signup={paths.signup}/>
        </nav>
        <div className={styles.mobileActions}>
          <StartNow signup={paths.signup}/>
          <details className={styles.mobileMenu}>
            <summary aria-label="Open navigation menu"><span/><span/><span/></summary>
            <nav aria-label="Mobile navigation">
              <Link href={paths.login}>Sign In</Link>
              <a href="#experience">How NICEJOBS Works</a>
            </nav>
          </details>
        </div>
      </div>
    </header>

    <section className={`${styles.scene} ${styles.hero}`} id="hero" aria-labelledby="hero-title" data-scene="hero">
      <Image className={styles.sceneImage} data-scene-image="hero" src="/images/nicejobs-cinematic-hero.webp" alt="A young woman with headphones and a backpack in a warmly lit learning space" fill priority sizes="100vw"/>
      <div className={styles.darkShade} aria-hidden="true"/>
      <div className={styles.lightArc} aria-hidden="true"/>
      <div className={styles.heroContent} data-scene-copy="hero">
        <p className={styles.darkEyebrow}>REAL OPPORTUNITIES <span>·</span> PRACTICAL EXPERIENCE <span>·</span> SKILL GROWTH</p>
        <h1 id="hero-title">Your Future<br/>Starts <span>Here.</span></h1>
        <p className={styles.heroDescription}>Discover real opportunities to learn through practical work, develop valuable skills and grow your earning potential.</p>
        <div className={styles.actions}>
          <StartNow signup={paths.signup}/>
          <a className={styles.secondaryDark} href="#experience"><span className={styles.playIcon} aria-hidden="true">▶</span>How NICEJOBS Works</a>
        </div>
        <ul className={styles.heroBenefits} aria-label="NICEJOBS benefits">
          {heroBenefits.map(({ label, icon: Icon }) => <li key={label}><Icon aria-hidden="true" size={22} strokeWidth={1.8}/><span>{label}</span></li>)}
        </ul>
      </div>
      <a className={styles.scrollCue} href="#experience"><span>Scroll to know more</span><ArrowDown size={18}/></a>
      <div className={styles.waveDark} aria-hidden="true"/>
    </section>

    <section className={`${styles.scene} ${styles.experience}`} id="experience" aria-labelledby="experience-title" data-scene="experience">
      <Image className={styles.sceneImage} data-scene-image="experience" src="/images/nicejobs-cinematic-experience.webp" alt="Four young Indian learners collaborating around a laptop" fill sizes="100vw"/>
      <div className={styles.lightShade} aria-hidden="true"/>
      <div className={styles.experienceContent} data-scene-copy="experience">
        <p className={styles.lightEyebrow}><span>02 — THE EXPERIENCE</span><i aria-hidden="true"/></p>
        <h2 id="experience-title"><span data-word="">Learn.</span> <span data-word="">Do.</span><br/><span data-word="">Earn.</span> <span className={styles.gradientWord} data-word="">Grow.</span></h2>
        <p className={styles.experienceDescription}>Get hands-on experience through real projects, build in-demand skills and unlock your earning potential — all within the MAXPASE Group ecosystem.</p>
        <ul className={styles.experienceBenefits}>
          {experienceBenefits.map(({ title, description, icon: Icon }) => <li key={title} data-benefit=""><span className={styles.benefitIcon}><Icon aria-hidden="true" size={21} strokeWidth={1.9}/></span><span><strong>{title}</strong><small>{description}</small></span></li>)}
        </ul>
      </div>
      <div className={styles.lightTrail} aria-hidden="true"><i/><i/></div>
      <a className={styles.scrollCue} href="#invitation"><span>Scroll to continue</span><ArrowDown size={18}/></a>
      <div className={styles.waveLight} aria-hidden="true"/>
    </section>

    <section className={`${styles.scene} ${styles.invitation}`} id="invitation" aria-labelledby="invitation-title" data-scene="invitation">
      <Image className={styles.sceneImage} data-scene-image="invitation" src="/images/nicejobs-cinematic-invitation.webp" alt="A confident young woman in a violet hoodie looking toward her next opportunity" fill sizes="100vw"/>
      <div className={styles.darkShade} aria-hidden="true"/>
      <div className={`${styles.lightArc} ${styles.invitationArc}`} aria-hidden="true"/>
      <div className={styles.invitationContent} data-scene-copy="invitation">
        <p className={styles.darkEyebrow}><span>03 — YOUR NEXT STEP</span><i aria-hidden="true"/></p>
        <h2 id="invitation-title">Make Your<br/>Next <span>Move.</span></h2>
        <p className={styles.invitationDescription}>Join NICEJOBS and get real experience, practical skills and the opportunity to build your earning potential.</p>
        <StartNow signup={paths.signup}/>
        <ul className={styles.closingBenefits}>
          {closingBenefits.map(({ label, icon: Icon }) => <li key={label}><Icon aria-hidden="true" size={25} strokeWidth={1.7}/>{label}</li>)}
        </ul>
      </div>
      <div className={styles.waveDark} aria-hidden="true"/>
    </section>

    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <div><Link className={styles.footerBrand} href={paths.home}>NICEJOBS</Link><p>Operated by AIRA Skill City Private Limited.</p></div>
        <nav aria-label="Legal and contact links"><Link href={`${siteBase}/terms`}>Terms</Link><Link href={`${siteBase}/privacy`}>Privacy</Link><Link href={`${siteBase}/contact`}>Contact</Link></nav>
        <p className={styles.footerNote}>Participation is free. Opportunities and incentives depend on eligibility, availability, verified results and their published terms. Employment, placement and income are not guaranteed.</p>
      </div>
    </footer>
  </main>;
}
