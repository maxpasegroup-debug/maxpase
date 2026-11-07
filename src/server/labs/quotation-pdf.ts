import { buildSimplePdf } from "./invoice-pdf";

type QuoteDocument = { row: { id: string; status: string; dueAt: Date | null }; data: { input: { items: Array<{ description: string; quantity: string; rate: string }>; currency: string; expiresAt: string }; totals: { subtotal: string; discount: string; tax: string; total: string }; issuer: { legalName: string; address: string; taxRegistration: string } | null }; customer: { company: string; name: string; email: string; phone: string } | null };
export function buildQuotationPdf(doc: QuoteDocument) {
  const { row, data, customer } = doc;
  const lines = [
    "AIRA LABS - QUOTATION",
    "Offered by AIRA SKILL CITY PRIVATE LIMITED",
    `Quotation reference: Q-${row.id.toUpperCase()}`,
    `Status: ${row.status.replaceAll("_", " ")}    Valid until: ${new Date(data.input.expiresAt).toISOString().slice(0,10)}`,
    "",
    "SUPPLIER",
    data.issuer?.legalName ?? "Issuer details pending verification",
    data.issuer?.address ?? "",
    `GSTIN: ${data.issuer?.taxRegistration ?? "Pending verification"}`,
    "",
    "CUSTOMER / PROSPECT",
    customer?.company ?? "Customer not recorded",
    customer?.name ?? "",
    customer?.email ?? "",
    customer?.phone ?? "",
    "",
    "SERVICE / DELIVERABLE                         QTY      UNIT PRICE",
    ...data.input.items.map(item => `${item.description} | ${item.quantity} | ${data.input.currency} ${item.rate}`),
    "",
    `Subtotal: ${data.input.currency} ${data.totals.subtotal}`,
    `Discount: ${data.input.currency} ${data.totals.discount}`,
    `GST (calculated using CA-reviewed service setup): ${data.input.currency} ${data.totals.tax}`,
    `TOTAL: ${data.input.currency} ${data.totals.total}`,
    "",
    "This quotation is an offer only. It is not a tax invoice or receipt.",
    "It is not confirmed as sent unless separate delivery evidence is recorded.",
  ];
  return buildSimplePdf(lines);
}
