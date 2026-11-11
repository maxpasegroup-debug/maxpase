/**
 * Public AIRA company legal-page identity and contact settings.
 * Keep legalEntityName null until it has been checked against the Certificate
 * of Incorporation. Do not substitute a guessed spelling in public policies.
 */
export const airaPublicLegal = {
  publicName: "AIRA Skill City",
  legalEntityName: null as string | null,
  legalNameStatus: "PENDING_COI_CONFIRMATION" as const,
  registeredOffice: "2619, T2, 6th Floor, HiLITE Business Park, HiLITE City, near Guruvayurappan College, Kozhikode, Kozhikode – 673014, Kerala, India",
  email: "hello@airaskillcity.com",
  phone: "+91 9074818881",
  website: "https://airaskillcity.com/",
};

export const airaPublicLegalLinks = [
  { href: "/terms", label: "Terms of Use" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/refund-policy", label: "Refund & Cancellation Policy" },
  { href: "/contact", label: "Contact Us" },
  { href: "/grievance", label: "Grievance Redressal" },
] as const;
