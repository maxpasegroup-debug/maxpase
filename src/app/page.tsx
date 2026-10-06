import Link from "next/link";
import { ArrowDown, ArrowUpRight, ArrowRight, Grid2X2, GraduationCap, Lightbulb, Cpu } from "lucide-react";

const companies = [
  { number: "01", name: "AIRA Skill City", legal: "AIRA SKILL CITY PRIVATE LIMITED", description: "Skills. Startups. Careers.", icon: GraduationCap, brands: [["Aira Skill City", "https://airaskillcity.com"], ["Startup School", "https://airastartupskool.com"], ["AIRA Labs", "https://airalabs.online"], ["Nice Jobs", "https://nicejobs.online"]] },
  { number: "02", name: "PEARN", legal: "PEARN PRIVATE LIMITED", description: "Teaching and learning, connected.", icon: Lightbulb, brands: [["TeachX Guru", "https://teachx.guru"], ["LearnX Guru", "https://learnx.guru"]] },
  { number: "03", name: "Top Rank AI", legal: "TOP RANK AI PRIVATE LIMITED", description: "A platform for intelligent possibilities.", icon: Cpu, brands: [] }
];
export default function Home() {
  return <main className="group-landing">
    <header className="group-header"><Link className="group-wordmark" href="/" aria-label="MAXPASE GROUP home"><Grid2X2 size={28} /><span>MAXPASE<span className="wordmark-sub">GROUP</span></span></Link><nav aria-label="Public navigation"><a className="group-about-link" href="#companies">Our companies</a><Link className="group-cta" href="/login">Login<ArrowUpRight size={17} /></Link></nav></header>
    <section className="group-hero" aria-labelledby="group-title">
      <div className="group-hero-content"><p className="group-kicker">EDUCATION. ENTERPRISE. INNOVATION.</p><h1 id="group-title">MAXPASE<br />GROUP<span className="hero-period">.</span></h1><p className="group-hero-description">Connecting talent, ideas and technology.<br />Building what comes next, together.</p><a className="group-cta hero-cta" href="#companies">Discover our group<ArrowRight size={19} /></a></div>
      <div className="group-hero-footer"><span>AIRA SKILL CITY / PEARN / TOP RANK AI</span><a href="#companies" aria-label="Explore our companies"><ArrowDown size={22} /></a></div>
    </section>
    <section className="group-companies" id="companies"><header><p className="group-kicker">OUR ECOSYSTEM</p><h2>Distinct ambitions.<br />One connected group.</h2><p>Education, entrepreneurship and technology brought together under MAXPASE GROUP.</p></header><div className="group-company-grid">{companies.map(c => <article className="group-public-company" key={c.number}><div className="company-topline"><span>{c.number}</span><c.icon size={26} /></div><h3>{c.name}</h3><p>{c.description}</p><ul>{c.brands.map(([label, url]) => <li key={label}><a href={url} target="_blank" rel="noopener noreferrer">{label}<ArrowUpRight size={16} /></a></li>)}</ul><small>{c.legal}</small></article>)}</div></section>
    <section className="group-command-band"><div><p className="group-kicker">MAXPASE OS</p><h2>A shared direction.<br />A clear command.</h2></div><Link className="group-cta" href="/login">Enter command center<ArrowUpRight size={18} /></Link></section>
    <footer className="group-public-footer"><span>MAXPASE GROUP</span><span>Education / Enterprise / Innovation</span><a href="https://unsplash.com" target="_blank" rel="noopener noreferrer">Illustrative workspace photograph: Unsplash</a></footer>
  </main>;
}
