import Link from "next/link";
import { airaPublicLegal, airaPublicLegalLinks } from "@/server/portals/aira-public-legal";
import styles from "./public-legal.module.css";

export type AiraLegalPageKind = "terms" | "privacy" | "refund-policy" | "contact" | "grievance";

const pageTitles: Record<AiraLegalPageKind, string> = {
  terms: "Terms of Use",
  privacy: "Privacy Policy",
  "refund-policy": "Refund & Cancellation Policy",
  contact: "Contact AIRA Skill City",
  grievance: "Grievance Redressal",
};

function CompanyNotice() {
  if (airaPublicLegal.legalEntityName) return <aside className={styles.notice}><strong>Legal entity:</strong> {airaPublicLegal.legalEntityName}</aside>;
  return <aside className={styles.notice}>
    <strong>Company identity confirmation in progress.</strong> This website uses “AIRA Skill City” as its public service name. The registered legal name is being checked against the Certificate of Incorporation and is not stated here as final.
  </aside>;
}

function ContactDetails() {
  return <ul className={styles.contact}>
    <li><strong>Email:</strong> <a href={`mailto:${airaPublicLegal.email}`}>{airaPublicLegal.email}</a></li>
    <li><strong>Phone:</strong> <a href={`tel:${airaPublicLegal.phone.replaceAll(" ", "")}`}>{airaPublicLegal.phone}</a></li>
    <li><strong>Office:</strong> <address>{airaPublicLegal.registeredOffice}</address></li>
    <li><strong>Website:</strong> <a href={airaPublicLegal.website}>{airaPublicLegal.website}</a></li>
  </ul>;
}

function Body({ kind, home }: { kind: AiraLegalPageKind; home: string }) {
  const legalHref = (path: string) => home === "/" ? path : `${home}${path}`;
  if (kind === "terms") return <>
    <p>These terms describe use of the AIRA Skill City public website and the general conditions for enquiries about its learning, education, professional training and related services. A programme, service proposal, enrolment or other written agreement may have additional terms. Read those terms before registering, accepting an offer or paying.</p>
    <h2>Website and enquiries</h2><p>Use the website lawfully and provide accurate information when contacting us, registering or applying. Do not impersonate another person, disrupt the website, misuse another person’s information or submit information you are not authorized to share. Sending an enquiry or application does not itself create a contract, admission or employment relationship.</p>
    <h2>Programmes, eligibility and admission</h2><p>Programme content, eligibility, availability, dates, delivery method and admission decisions may vary by programme. Any admission is subject to the applicable published criteria and confirmation from the programme team. Website content alone does not guarantee admission, examination results, employment, income or another outcome.</p>
    <h2>Fees, taxes and payment</h2><p>Any applicable fee, tax, payment schedule, instalment terms and payment method will be shown in the programme’s written offer, checkout or other terms before payment is requested. A quotation or enquiry is not a payment instruction. Do not pay unless you have received the applicable service and cancellation terms.</p>
    <h2>Changes and cancellations</h2><p>Programmes may be rescheduled, changed or withdrawn where reasonably necessary. Any effect on a participant’s payment or enrolment will be handled under that programme’s written terms and the applicable law. See the <Link href={legalHref("/refund-policy")}>Refund &amp; Cancellation Policy</Link>; programme-specific written terms control where they provide details for that purchase.</p>
    <h2>Content and intellectual property</h2><p>Unless a page or written agreement says otherwise, website text, visual design, course materials and marks are owned by or licensed to their respective rights holders. You may use materials for personal learning only as permitted by the relevant programme terms. Do not copy, publish, sell or redistribute protected materials without permission.</p>
    <h2>Third-party services</h2><p>The website may link to third-party websites or use service providers. Their own terms and privacy notices apply to their services. A link does not mean AIRA Skill City controls or endorses every third-party service.</p>
    <h2>Disclaimers and liability</h2><p>We aim to keep information useful and current, but website material may change and is not a substitute for programme-specific written terms. Nothing in these terms excludes a right or liability that cannot be excluded under applicable law. Any permitted limitation of liability must be read subject to those mandatory rights.</p>
    <h2>Governing law and questions</h2><p>These terms are intended to be governed by the laws of India, subject to applicable law and the jurisdiction of competent courts. This governing-law and jurisdiction wording requires legal review before final adoption. Contact us with questions or use the <Link href={legalHref("/grievance")}>grievance procedure</Link>.</p>
  </>;

  if (kind === "privacy") return <>
    <p>This notice explains how AIRA Skill City handles information through this website and related company-operated enquiries and programme workflows. Different portals or programmes may provide an additional notice where their data use differs.</p>
    <h2>Information that may be processed</h2><p>Depending on how you use a service, information may include contact details and enquiry text you submit; account and registration details; application, eligibility, learning or participation information; correspondence and support requests; payment, invoice or transaction status and references; and technical information needed to deliver, secure and troubleshoot the service. Do not send Aadhaar or other sensitive identity documents unless a specific authorized process requests them.</p>
    <h2>How we use information</h2><p>Information is used to respond to enquiries, provide requested website or programme services, manage registration and applications, communicate about participation or payments, maintain records, protect accounts and services, address complaints and meet legal obligations.</p>
    <h2>Cookies and technical information</h2><p>Account areas use necessary session cookies to maintain sign-in. The public AIRA landing page records aggregate counts when the journey opens, when someone skips to the brand choices, reaches the brand portals, or selects a brand. These counts are used to improve the page. This measurement does not set analytics cookies or retain visitor identifiers, IP addresses, referrers, or browser fingerprints. The application may separately process ordinary request and security information to operate and protect the service.</p>
    <h2>Service providers and payments</h2><p>Information may be processed by authorized service providers that help operate hosting, communications, support or payment services, limited to the service they provide. If a payment gateway is used for a transaction, that provider processes payment instrument details under its own terms and privacy notice. AIRA Skill City’s systems may receive transaction confirmations, amounts, references and related invoice information. Do not send card PINs, passwords or full payment credentials to us by email.</p>
    <h2>Sharing and retention</h2><p>Information is shared only as needed to provide the requested service, with authorized service providers or programme teams, with your direction, or where required to protect rights or comply with law. Retention depends on the purpose, programme records and applicable legal requirements. We have not published a fixed deletion period here; contact us to ask about a particular record.</p>
    <h2>Security</h2><p>Access controls and technical and organizational safeguards are used as appropriate to the information and service. No online service can guarantee absolute security. We do not claim a particular certification in this notice.</p>
    <h2>Your requests and communication choices</h2><p>You may contact us to request access, correction or deletion where applicable, ask about processing, or change a communication preference. We may need to verify your identity and may retain information where required or permitted by law. Service-critical messages may still be sent where needed to provide a service.</p>
    <h2>Children and learners under 18</h2><p>Some educational services may be used by minors. A parent or legal guardian should review the relevant programme notice and provide any consent required by law. Do not submit a child’s personal information unless you are authorized to do so. Contact us if you believe information was submitted without appropriate authorization.</p>
    <h2>Privacy complaints</h2><p>For a privacy request or complaint, email <a href={`mailto:${airaPublicLegal.email}`}>{airaPublicLegal.email}</a> with “Privacy request” in the subject, or use the <Link href={legalHref("/grievance")}>grievance procedure</Link>.</p>
  </>;

  if (kind === "refund-policy") return <>
    <div className={styles.notice}><strong>Programme refund terms require confirmation.</strong> No universal refund period, processing deadline or no-refund rule is established by this page. Obtain the specific written terms before making a payment.</div>
    <h2>Before you pay</h2><p>Each programme or service must disclose its fee, applicable taxes, cancellation conditions, refund eligibility and any calculation method before payment. Those programme-specific written terms apply to that purchase and should be retained with your receipt.</p>
    <h2>Cancellation and refund requests</h2><p>Send a written request to <a href={`mailto:${airaPublicLegal.email}?subject=Cancellation%20or%20refund%20request`}>{airaPublicLegal.email}</a>. Include your name, programme or service, registered email or phone, payment date, transaction reference, amount and a short description of the request. Do not include full card details or account credentials.</p>
    <h2>Duplicate, failed or unrecognized transactions</h2><p>Contact us with the transaction reference and available payment confirmation. We will review the transaction against our records and the applicable payment provider process. A pending or failed payment may be subject to the bank or payment provider’s processing rules.</p>
    <h2>Instalments and programme changes</h2><p>Instalment obligations, cancellation charges, refunds for a programme change, postponement or cancellation, and any refund calculation must be stated in the applicable programme terms. No such amount or deadline is implied by this general page.</p>
    <h2>Review status</h2><p>Founder and CA/legal confirmation is required for programme-specific eligibility, deductions or charges, refund calculations and processing timelines before this policy can be treated as the company’s final payment policy.</p>
  </>;

  if (kind === "contact") return <>
    <p>Use the contact details below for company enquiries, programme questions, customer support, privacy requests and payment support. Please include the relevant programme or invoice reference when one exists. Do not send passwords, PINs or full card details.</p>
    <ContactDetails />
    <h2>Contact form</h2><p>This page uses email and telephone links rather than an online form. This keeps enquiries within the existing supported contact channels.</p>
  </>;

  return <>
    <p>We welcome complaints about our services, programmes, website, privacy practices or payments. You can submit a grievance by email or telephone using the official details below.</p>
    <h2>What to include</h2><p>Describe the issue, the relevant programme or service, the date, and what resolution you are seeking. Include a contact method and a transaction or application reference if relevant. Share only the information needed to investigate; do not send passwords, PINs or full payment credentials.</p>
    <h2>What happens next</h2><p>We will review the grievance and use the contact details provided to acknowledge or request information where appropriate. No acknowledgement or resolution timeline is published until an authorized company policy is confirmed. If you are dissatisfied with the response, reply to the same thread and mark it “Escalation”.</p>
    <h2>Privacy grievances</h2><p>For a privacy complaint, include “Privacy grievance” in the subject. We may need to verify identity before discussing or changing personal information.</p>
    <h2>Authorized grievance officer</h2><p>An authorized grievance officer’s name and designation have not been supplied for publication. The company must confirm whether to designate one and provide approved details before this page can name that role.</p>
    <ContactDetails />
  </>;
}

export function AiraPublicLegalPage({ kind, home = "/" }: { kind: AiraLegalPageKind; home?: string }) {
  return <main className={styles.page}>
    <header className={styles.top}><Link className={styles.brand} href={home}>AIRA SKILL CITY</Link><Link className={styles.back} href={home}>Back to website</Link></header>
    <article className={styles.article}>
      <p className={styles.eyebrow}>AIRA SKILL CITY · PUBLIC INFORMATION</p>
      <h1>{pageTitles[kind]}</h1>
      <CompanyNotice />
      <Body kind={kind} home={home} />
      <h2>Company contact details</h2><ContactDetails />
      <div className={styles.related}><h2>Related pages</h2><nav aria-label="Legal and contact pages">{airaPublicLegalLinks.map(link => <Link key={link.href} href={home === "/" ? link.href : `${home}${link.href}`}>{link.label}</Link>)}</nav></div>
    </article>
  </main>;
}
