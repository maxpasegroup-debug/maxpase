import { buildSimplePdf } from "@/server/labs/invoice-pdf";

export function buildHrLetterPdf(input: { companyName: string; brandName?: string | null; kind: string; title: string; recipientName: string; subject: string; body: string }) {
  const lines = [
    input.companyName,
    input.brandName ? `Brand: ${input.brandName}` : "",
    "",
    input.title.toLocaleUpperCase("en-IN"),
    `Letter type: ${input.kind.replaceAll("_", " ")}`,
    `Prepared for: ${input.recipientName}`,
    `Subject: ${input.subject}`,
    "",
    ...input.body.split(/\r?\n/).flatMap(line => line.match(/.{1,92}(?:\s|$)|.{1,92}/g) ?? [""]),
    "",
    "This document was prepared through the MAXPASE HR workspace. Confirm terms and authorized signatory before issue.",
  ].filter((line, index) => line || index > 1);
  return buildSimplePdf(lines);
}
