export type Venture = {
  id: "startup" | "labs" | "jobs";
  label: string;
  description: string;
  cta: string;
  href: string;
  accent: string;
  tone: string;
};

const ventureCopy: Array<Omit<Venture, "href">> = [
  {
    id: "startup",
    label: "AIRA STARTUP SCHOOL",
    description: "Learn. Build. Launch.",
    cta: "EXPLORE STARTUP SCHOOL",
    accent: "#e7b15a",
    tone: "A founder studio for practical learning and first ventures."
  },
  {
    id: "labs",
    label: "AIRA LABS",
    description: "Imagine. Experiment. Innovate.",
    cta: "EXPLORE AIRA LABS",
    accent: "#49d6ff",
    tone: "A technology workshop for experiments, systems and new tools."
  },
  {
    id: "jobs",
    label: "NICE JOBS",
    description: "Discover opportunities. Build your future.",
    cta: "EXPLORE NICE JOBS",
    accent: "#8aa6ff",
    tone: "A career hub where published opportunities stay clear before you commit."
  }
];

export function venturesFor(hrefs: Record<Venture["id"], string>): Venture[] {
  return ventureCopy.map(venture => ({ ...venture, href: hrefs[venture.id] }));
}

/**
 * Destinations that already exist in this app or on the public AIRA domains.
 * About opens the AIRA Skill City company page. Contact opens AIRA Labs, which
 * carries the public enquiry. Social entries are the live brand domains.
 */
export const airaDestinations = {
  discover: "/sites/skillcity",
  about: "/sites/skillcity",
  contact: "/sites/labs",
  social: [
    { label: "Skill City", href: "https://airaskillcity.com" },
    { label: "Labs", href: "https://airalabs.online" },
    { label: "Nice Jobs", href: "https://nicejobs.online" }
  ]
} as const;
