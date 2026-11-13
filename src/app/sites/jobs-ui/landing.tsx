import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, BookOpenCheck, Check, Compass, GraduationCap, Sparkles, Target } from "lucide-react";
import type { portalPaths } from "@/server/portals/sites";
import { opportunityPreview, type LandingOpportunity } from "./landing-data";
import styles from "./landing.module.css";
import { StartNow } from "./start-now";
import { JobsLandingMotion } from "./landing-motion";

type Paths = ReturnType<typeof portalPaths>;

const journey = [
  { title: "Discover", description: "Explore an opportunity and understand what it involves.", icon: Compass },
  { title: "Understand", description: "Read the eligibility, responsibilities and terms before you decide.", icon: BookOpenCheck },
  { title: "Apply", description: "Send an application for an opportunity that fits you.", icon: ArrowUpRight },
  { title: "Learn", description: "Build useful skills with guidance and practical learning.", icon: GraduationCap },
  { title: "Complete tasks", description: "Work through the approved tasks and share your results.", icon: Target },
  { title: "Grow", description: "Use feedback and experience to plan your next step.", icon: Sparkles }
] as const;

const faqs = [
  { q: "What is NICEJOBS?", a: "NICEJOBS is a career hub for in-house opportunities from the AIRA Skill City ecosystem. You can explore approved opportunities, learn through practice and review the terms before you apply." },
  { q: "Does joining guarantee work or income?", a: "No. Creating an account or applying does not guarantee employment, placement or earnings. Each opportunity has its own eligibility, review and terms." },
  { q: "Is participation free?", a: "Yes. NICEJOBS participation is free. Any incentive depends on approved tasks, verified results and the terms of the specific opportunity." },
  { q: "What opportunities can I apply for?", a: "Only approved, published in-house opportunities can accept applications. If none are open, the page will say so." },
  { q: "How does learning work?", a: "Where a programme offers learning and guidance, you can practise through practical tasks, receive feedback and build experience step by step." }
] as const;

export function JobsLanding({ paths, opportunities, availability }: { paths: Paths; opportunities: LandingOpportunity[]; availability: "ready" | "unavailable" }) {
  const preview = opportunityPreview(availability, opportunities);
  const siteBase = paths.home === "/" ? "" : paths.home.replace(/\/$/, "");
  return <main className={styles.page} data-jobs-landing="">
    <JobsLandingMotion />
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link className={styles.brand} href={paths.home} aria-label="NICEJOBS home">
          <span className={styles.brandMark} aria-hidden="true"><span>N</span></span>
          <span>NICEJOBS<small>Career Hub · AIRA Skill City</small></span>
        </Link>
        <nav className={styles.nav} aria-label="Main navigation">
          <a href="#discover" data-nav="discover">Discover</a>
          <a href="#opportunities" data-nav="opportunities">Opportunities</a>
          <a href="#learn" data-nav="learn">Learn</a>
          <a href="#journey" data-nav="journey">How it works</a>
          <a href="#growth" data-nav="growth">Your growth</a>
          <a href="#faq">FAQ</a>
          <Link className={styles.signIn} href={paths.login}>Sign in</Link>
          <StartNow signup={paths.signup}/>
        </nav>
        <details className={styles.mobileMenu}>
          <summary aria-label="Open navigation menu"><span/><span/><span/></summary>
          <nav aria-label="Mobile navigation">
            <a href="#discover">Discover</a><a href="#opportunities">Opportunities</a><a href="#learn">Learn</a><a href="#journey">How it works</a><a href="#growth">Your growth</a><a href="#faq">FAQ</a>
            <Link href={paths.login}>Sign in</Link><StartNow signup={paths.signup}/>
          </nav>
        </details>
      </div>
    </header>

    <section className={styles.hero} id="top" aria-labelledby="jobs-title" data-chapter="discover" data-hero="">
      <Image className={styles.heroImage} data-hero-image="" src="/images/nice-jobs-hero-v2.webp" alt="Two young people planning a practical project together" fill priority sizes="100vw"/>
      <div className={styles.heroShade} data-hero-shade=""/>
      <div className={styles.heroInner}>
        <div className={styles.heroCopy} data-hero-copy="">
          <p className={styles.heroEyebrow}>AIRA CAREER HUB <span>·</span> LEARN BY DOING</p>
          <h1 id="jobs-title">LEARN. DO.<br/>EARN. GROW.</h1>
          <p className={styles.heroDescription}>Discover real opportunities to learn through practical work, develop valuable skills and grow your earning potential.</p>
          <div className={styles.heroActions}><StartNow signup={paths.signup}/><a className={styles.heroSecondary} href="#opportunities">Explore Opportunities <ArrowRight size={17}/></a></div>
          <a className={styles.scrollHint} href="#discover"><span>Discover possibilities</span><ArrowDown size={16}/></a>
        </div>
      </div>
      <div className={styles.heroTransform} data-hero-transform="" aria-hidden="true"><span>NICE</span><span>JOBS</span><small>LEARN · DO · EARN · GROW</small></div>
      <div className={styles.heroProgress} aria-hidden="true"><span data-hero-progress=""/></div>
    </section>

    <section className={styles.discover} id="discover" aria-labelledby="discover-title" data-chapter="discover">
      <div className={styles.container}>
        <div className={styles.chapterLabel}><span>01</span><span>DISCOVER POSSIBILITIES</span></div>
        <div className={styles.discoverGrid}>
          <div className={styles.discoverImage} data-reveal-image>
            <Image data-parallax="" src="/images/nicejobs-learn-together.webp" alt="Three young adults sharing ideas around a laptop" fill sizes="(max-width: 800px) 100vw, 55vw"/>
            <span className={styles.imageCaption}>A place to explore what you can do next.</span>
          </div>
          <div className={styles.discoverCopy} data-reveal>
            <p className={styles.eyebrow}>A CAREER HUB FOR REAL EXPERIENCE</p>
            <h2 id="discover-title">A new way to find your next step.</h2>
            <p>NICEJOBS connects you with approved in-house opportunities across the MAXPASE Group ecosystem. Start by understanding the work, then choose a path that feels right for you.</p>
            <a className={styles.textLink} href="#opportunities">See what is open <ArrowRight size={17}/></a>
          </div>
        </div>
      </div>
    </section>

    <section className={styles.opportunities} id="opportunities" aria-labelledby="opportunities-title" data-chapter="opportunities">
      <div className={styles.container}>
        <div className={styles.opportunitiesHeading} data-reveal>
          <div><div className={styles.chapterLabel}><span>02</span><span>REAL OPPORTUNITIES</span></div><h2 id="opportunities-title">Explore what is available.</h2><p>Only approved, published in-house opportunities appear here.</p></div>
          <Link className={styles.textLink} href={paths.opportunities}>Explore all opportunities <ArrowRight size={17}/></Link>
        </div>
        {preview.state === "unavailable" ? <div className={styles.empty} role="status"><h3>Opportunities are temporarily unavailable.</h3><p>Please check the Opportunities page again later.</p></div> : preview.state === "published" ? <div className={styles.opportunityList}>{preview.opportunities.map((opportunity, index) => <article key={opportunity.id} data-reveal><span className={styles.opportunityIndex}>0{index + 1}</span><div><p className={styles.listLabel}>APPROVED · OPEN</p><h3>{opportunity.title}</h3><p>{opportunity.employer}{opportunity.areas.length ? ` · ${opportunity.areas.join(", ")}` : ""}</p></div><Link href={paths.opportunities} aria-label={`View ${opportunity.title} opportunity`}>View details <ArrowUpRight size={18}/></Link></article>)}</div> : <div className={styles.empty} role="status"><h3>No opportunities are open for applications right now.</h3><p>New approved in-house opportunities will appear here when applications open.</p></div>}
        <p className={styles.exampleNote}>Examples of work are not active opportunities unless they appear in the approved listings above.</p>
      </div>
    </section>

    <section className={styles.learning} id="learn" aria-labelledby="learning-title" data-chapter="learning">
      <div className={styles.container}>
        <div className={styles.chapterLabel}><span>03</span><span>LEARN BY DOING</span></div>
        <div className={styles.learningGrid}>
          <div className={styles.learningCopy} data-reveal>
            <p className={styles.eyebrow}>PRACTICE WITH PURPOSE</p>
            <h2 id="learning-title">Build skills by putting them to work.</h2>
            <p>Learning can happen through practice. Where training is offered, you can try real tasks, get guidance and use feedback to improve your work.</p>
            <ul><li><Check size={16}/> Learn at a practical pace</li><li><Check size={16}/> Ask questions and get guidance</li><li><Check size={16}/> Build experience through tasks</li></ul>
          </div>
          <div className={styles.learningImage} data-reveal-image><Image data-parallax="" src="/images/nicejobs-guided-practice.webp" alt="A learner practising a digital task with a mentor" fill sizes="(max-width: 800px) 100vw, 52vw"/><span className={styles.imageCaption}>Learn a skill. Practise it. Grow with experience.</span></div>
        </div>
      </div>
    </section>

    <section className={styles.journey} id="journey" aria-labelledby="journey-title" data-chapter="journey">
      <div className={styles.container}>
        <div className={styles.sectionHeading} data-reveal><div className={styles.chapterLabel}><span>04</span><span>REAL WORK · REAL EXPERIENCE</span></div><h2 id="journey-title">A clear path, one step at a time.</h2><p>Every opportunity is different. This is the simple journey you can expect to follow.</p></div>
        <ol className={styles.steps}>{journey.map((step, index) => { const Icon = step.icon; return <li key={step.title} data-journey-step><span className={styles.stepNumber}>0{index + 1}</span><span className={styles.stepIcon}><Icon size={21} strokeWidth={1.8}/></span><h3>{step.title}</h3><p>{step.description}</p></li>; })}</ol>
        <div className={styles.journeyLine} aria-hidden="true"><span data-journey-line=""/></div>
      </div>
    </section>

    <section className={styles.growth} id="growth" aria-labelledby="growth-title" data-chapter="growth">
      <div className={styles.container}>
        <div className={styles.growthPanel} data-reveal>
          <div className={styles.growthCopy}><div className={styles.chapterLabel}><span>05</span><span>YOUR EFFORT · YOUR GROWTH</span></div><h2 id="growth-title">Your effort can open new possibilities.</h2><p>Participation is free. Incentives, when offered, depend on approved tasks, verified results and the terms of that opportunity.</p><p className={styles.disclaimer}>Opportunities and incentives are subject to eligibility, availability and review. Employment, placement and earnings are not guaranteed.</p><Link className={styles.textLink} href={paths.opportunities}>Review available opportunities <ArrowRight size={17}/></Link></div>
          <div className={styles.growthImage}><Image src="/images/nicejobs-learn-together.webp" alt="Young collaborators discussing their next practical step" fill sizes="(max-width: 800px) 100vw, 45vw"/></div>
        </div>
      </div>
    </section>

    <section className={styles.finalCta} aria-labelledby="final-title" data-chapter="start">
      <Image src="/images/nicejobs-next-chapter.webp" alt="Young adults sharing a project they completed together" fill sizes="100vw"/>
      <div className={styles.finalShade}/>
      <div className={styles.finalContent} data-reveal><p className={styles.eyebrow}>YOUR JOURNEY STARTS HERE</p><h2 id="final-title">YOUR NEXT CHAPTER<br/>STARTS HERE.</h2><p>Explore, learn and take your next step with NICEJOBS.</p><StartNow signup={paths.signup}/></div>
    </section>

    <section className={styles.faq} id="faq" aria-labelledby="jobs-faq-title">
      <div className={styles.container}><div className={styles.sectionHeading} data-reveal><p className={styles.eyebrow}>GOOD TO KNOW</p><h2 id="jobs-faq-title">Questions before you begin?</h2></div><div className={styles.faqList}>{faqs.map(item => <details key={item.q}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div></div>
    </section>

    <footer className={styles.footer}><div className={styles.container}><div className={styles.footerBrandBlock}><Link className={styles.footerBrand} href={paths.home}>NICEJOBS</Link><p>A career hub by AIRA Skill City. Discover in-house opportunities, practical learning and clear terms.</p></div><nav className={styles.footerNav} aria-label="NICEJOBS footer"><Link href="#discover">Discover</Link><Link href={paths.opportunities}>Opportunities</Link><Link href="#journey">How it works</Link><Link href="#faq">FAQ</Link><Link href={paths.signup}>Get started</Link><Link href={paths.login}>Sign in</Link><Link href={`${siteBase}/terms`}>Terms</Link><Link href={`${siteBase}/privacy`}>Privacy</Link></nav><p className={styles.footerLegal}>NICEJOBS is operated within AIRA Skill City Private Limited. Participation is free. Opportunities and incentives have their own eligibility and terms. No employment, placement or income is guaranteed.</p></div></footer>
  </main>;
}
