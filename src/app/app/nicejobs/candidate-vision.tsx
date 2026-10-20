import Link from "next/link";
import { candidateVision } from "@/server/nicejobs/candidate-vision";
import { VisionForm } from "./vision-form";
import styles from "./candidate-vision.module.css";

export async function CandidateVision({ userId, realm, base }: { userId: string; realm: "corporate" | "jobs"; base: string }) {
  if (realm !== "jobs") return <section className={styles.board}><h1>My Goals</h1><p>Open your Nice Jobs account to manage your personal goal.</p></section>;
  let vision;
  try { vision = await candidateVision.read(userId); }
  catch { return <section className={styles.board}><h1>My Goals</h1><p role="alert">Your personal goal is temporarily unavailable. Reload to try again.</p></section>; }
  return <div className={styles.board}>
    <header><p className={styles.eyebrow}>YOUR VISION BOARD</p><h1>My Goals</h1><p>Choose a skill or outcome you want to build. This is your personal plan, not an employment target or earnings promise.</p></header>
    <div className={styles.layout}><section aria-labelledby="vision-title"><h2 id="vision-title">Your direction</h2><VisionForm initial={vision} /></section>
      <aside aria-labelledby="tara-title"><h2 id="tara-title">Plan with TARA</h2><p>TARA can help explain a published opportunity and prepare an application when assistance is configured for that application. It does not approve work, set pay or make decisions for you.</p><Link href={`${base}?view=my-work`}>Open My Space</Link><p className={styles.note}>For a work goal or incentive, use the approved manager-reviewed workflow after activation.</p></aside></div>
  </div>;
}
