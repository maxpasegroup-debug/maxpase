import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowRight, BookOpenCheck, BriefcaseBusiness, Compass, GraduationCap, Handshake, Sparkles, Target } from "lucide-react";
import type { portalPaths } from "@/server/portals/sites";
import { opportunityPreview, type LandingOpportunity } from "./landing-data";
import styles from "./landing.module.css";

type Paths = ReturnType<typeof portalPaths>;

const copy = {
  brand: "Nice Jobs",
  hero: {
    eyebrow: "AIRA CAREER HUB / LEARN BY DOING",
    headline: "Nice Jobs",
    promise: "Build your next opportunity.",
    description: "Discover practical opportunities, learn the work, and move towards earning with guidance at every step.",
    note: "Opportunities have their own eligibility, terms and earning rules. No income is guaranteed."
  },
  journey: [
    { title: "Discover", description: "See what is open and understand the role before you apply.", icon: Compass },
    { title: "Learn", description: "Get oriented and build useful skills through short lessons.", icon: GraduationCap },
    { title: "Take action", description: "Practise real tasks, submit your work and receive feedback.", icon: Target },
    { title: "Work towards earning", description: "See your progress and the approved rules for each opportunity.", icon: BriefcaseBusiness }
  ],
  guidance: [
    { title: "Know the work", description: "Clear responsibilities and terms help you decide whether an opportunity fits.", icon: BookOpenCheck },
    { title: "Grow through practice", description: "Orientation, useful resources and feedback help turn learning into action.", icon: Sparkles },
    { title: "Get human support", description: "Managers make formal decisions. Guidance helps you prepare your next step.", icon: Handshake }
  ],
  faqs: [
    { q: "What is Nice Jobs?", a: "Nice Jobs is the public site for AIRA Career Hub. You can look at approved opportunities, learn through practice, and read the terms for work that may lead to earning." },
    { q: "Does creating an account give me a job?", a: "No. Signing up does not create a job, an application or guaranteed income. Every published opportunity has its own eligibility, terms and earning rules." },
    { q: "Which roles can I apply for?", a: "Only approved, published opportunities can accept applications. If the catalogue is empty or temporarily unavailable, there is no open role to apply for." },
    { q: "Who decides what happens next?", a: "People do. Managers make formal decisions. Learning and guidance can help you prepare, and they do not replace that review." }
  ]
} as const;

export function JobsLanding({ paths, opportunities, availability }: { paths: Paths; opportunities: LandingOpportunity[]; availability: "ready" | "unavailable" }) {
  const preview = opportunityPreview(availability, opportunities);
  return <main className={styles.page} data-motion="">
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link className={styles.brand} href={paths.home} aria-label="Nice Jobs home"><span className={styles.brandMark}><BriefcaseBusiness size={22} strokeWidth={2.2}/></span><span>Nice Jobs<small>AIRA Career Hub</small></span></Link>
        <nav className={styles.nav} aria-label="Main navigation"><Link className={styles.navHow} href="#how-it-works">How it works</Link><Link className={styles.navOpportunities} href={paths.opportunities}>Opportunities</Link><Link className={styles.navFaq} href="#faq">FAQ</Link><Link className={styles.signIn} href={paths.login}>Sign in</Link><Link className={styles.headerCta} href={paths.signup}>Get started <ArrowRight size={17}/></Link></nav>
      </div>
    </header>

    <section className={styles.hero} aria-labelledby="jobs-title">
      <Image className={styles.heroImage} src="/images/nice-jobs-hero-v2.webp" alt="Two people planning a practical project together" fill priority sizes="100vw"/>
      <div className={styles.heroInner}>
        <div className={styles.heroCopy}>
          <p className={styles.heroEyebrow}>{copy.hero.eyebrow}</p>
          <h1 id="jobs-title">{copy.hero.headline}<span>.</span></h1>
          <p className={styles.heroPromise}>{copy.hero.promise}</p>
          <p className={styles.heroDescription}>{copy.hero.description}</p>
          <div className={styles.heroActions}><Link className={styles.primaryButton} href={paths.opportunities}>Explore Opportunities <ArrowRight size={19}/></Link><Link className={styles.heroSecondary} href={paths.signup}>Get started <ArrowRight size={17}/></Link></div>
          <p className={styles.heroNote}>{copy.hero.note}</p>
        </div>
        <a className={styles.scrollHint} href="#how-it-works" aria-label="See how Nice Jobs works"><ArrowDown size={20}/></a>
      </div>
    </section>

    <section className={styles.journey} id="how-it-works" aria-labelledby="journey-title"><div className={styles.container}>
      <div className={styles.sectionHeading}><p className={styles.eyebrow}>THE JOURNEY</p><h2 id="journey-title">A clearer way to begin.</h2><p>One useful step at a time, from understanding an opportunity to building practical experience.</p></div>
      <ol className={styles.steps}>{copy.journey.map((step, index) => { const Icon = step.icon; return <li key={step.title}><div className={styles.stepTop}><span className={styles.stepIcon}><Icon size={23} strokeWidth={1.8}/></span><span className={styles.stepNumber}>0{index + 1}</span></div><h3>{step.title}</h3><p>{step.description}</p></li>; })}</ol>
    </div></section>

    <section className={styles.opportunities} id="opportunities" aria-labelledby="opportunities-title"><div className={styles.container}>
      <div className={styles.opportunitiesHeading}><div><p className={styles.eyebrow}>OPPORTUNITIES</p><h2 id="opportunities-title">Find a path that fits.</h2><p>Only approved, published opportunities can accept applications.</p></div><Link className={styles.textLink} href={paths.opportunities}>Browse all opportunities <ArrowRight size={18}/></Link></div>
      {preview.state === "unavailable" ? <div className={styles.empty} data-card="" role="status"><h3>Opportunities are temporarily unavailable.</h3><p>Please check the Opportunities page again later.</p></div> : preview.state === "published" ? <div className={styles.opportunityList}>{preview.opportunities.map(opportunity => <article key={opportunity.id}><div><p className={styles.listLabel}>PUBLISHED OPPORTUNITY</p><h3>{opportunity.title}</h3><p>{opportunity.employer}{opportunity.areas.length ? ` / ${opportunity.areas.join(", ")}` : ""}</p></div><Link href={paths.opportunities} aria-label={`Browse ${opportunity.title} in Opportunities`}>View opportunity <ArrowRight size={18}/></Link></article>)}</div> : <div className={styles.empty} data-card="" role="status"><h3>No opportunities are open for applications right now.</h3><p>Approved opportunities will appear here when applications open.</p></div>}
      <p className={styles.exampleNote}>Advisory, automation and mentoring are examples of the kinds of work people may explore. They are not current vacancies unless published above.</p>
    </div></section>

    <section className={styles.guidance} aria-labelledby="guidance-title"><div className={styles.container}>
      <div className={styles.guidanceIntro}><p className={styles.eyebrow}>LEARNING THAT MOVES WITH YOU</p><h2 id="guidance-title">Support for the work ahead.</h2><p>Every published opportunity explains its own requirements. Where offered, structured learning and practical tasks help you prepare.</p></div>
      <div className={styles.guidanceGrid}>{copy.guidance.map(item => { const Icon = item.icon; return <article key={item.title}><Icon size={25} strokeWidth={1.7}/><h3>{item.title}</h3><p>{item.description}</p></article>; })}</div>
    </div></section>

    <section className={styles.trust} aria-label="Nice Jobs transparency"><div className={styles.container}><span className={styles.trustSymbol}><BookOpenCheck size={24}/></span><p>Clear terms before commitment. Applications, training and earnings depend on the specific approved opportunity; signing up alone does not create a job or guaranteed income.</p></div></section>

    <section className={styles.faq} id="faq" aria-labelledby="jobs-faq-title"><div className={styles.container}>
      <div className={styles.sectionHeading}><p className={styles.eyebrow}>BEFORE YOU APPLY</p><h2 id="jobs-faq-title">Questions about Nice Jobs.</h2></div>
      <div className={styles.faqList}>{copy.faqs.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div>
    </div></section>
    <section className={styles.finalCta} data-card="" aria-labelledby="final-title"><div className={styles.container}><div><p className={styles.eyebrow}>YOUR NEXT STEP</p><h2 id="final-title">Start with what is open.</h2><p>Take a look, understand the terms, and choose your next step.</p></div><Link className={styles.finalButton} href={paths.opportunities}>Explore Opportunities <ArrowRight size={19}/></Link></div></section>
    <footer className={styles.footer}><div className={styles.container}><div className={styles.footerBrandBlock}><Link className={styles.footerBrand} href={paths.home}>Nice Jobs</Link><p>AIRA Career Hub. Approved opportunities, practical learning and clear terms.</p></div><nav className={styles.footerNav} aria-label="Nice Jobs footer"><Link href="#how-it-works">How it works</Link><Link href={paths.opportunities}>Opportunities</Link><Link href="#faq">FAQ</Link><Link href={paths.signup}>Get started</Link><Link href={paths.login}>Sign in</Link></nav><p className={styles.footerLegal}>AIRA Skill City Private Limited. Signing up does not guarantee a job or income.</p></div></footer>
  </main>;
}
