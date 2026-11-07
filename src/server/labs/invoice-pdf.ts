type InvoiceDoc = {
  invoice: { invoiceNumber: string; issueDate: Date; dueDate: Date | null; totalAmount: string; status: string };
  supplier: Record<string, unknown>;
  customer: Record<string, unknown>;
  services: Array<{ description: string; quantity: string; rate: string; serviceName?: string; sacCode?: string }>;
  calculation: Record<string, string>;
};

const ascii = (text: string) => text.normalize("NFKD").replace(/[^\x20-\x7E]/g, "?").replace(/[\\()]/g, "\\$&");
const amount = (value: unknown) => String(value ?? "");
const digits = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
const teens = ["Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
function underThousand(value: number): string {
  const parts: string[] = [];
  if (value >= 100) { parts.push(digits[Math.floor(value / 100)] + " Hundred"); value %= 100; }
  if (value >= 10 && value < 20) parts.push(teens[value - 10]);
  else { if (value >= 20) parts.push(tens[Math.floor(value / 10)]); if (value % 10) parts.push(digits[value % 10]); }
  return parts.join(" ");
}
function rupeesInWords(value: string) {
  const [whole = "0", fraction = "00"] = value.split("."); let amount: bigint;
  try { amount = BigInt(whole); } catch { return "Amount in words unavailable"; }
  if (amount > 9999999999n) return "Amount in words outside supported range";
  const groups: [bigint,string][] = [[10000000n,"Crore"],[100000n,"Lakh"],[1000n,"Thousand"],[1n,""]];
  const words: string[] = [];
  for (const [size, name] of groups) { const count = amount / size; if (count) { words.push(underThousand(Number(count)) + (name ? ` ${name}` : "")); amount %= size; } }
  const paise = Number(fraction.padEnd(2,"0").slice(0,2));
  return `INR ${words.join(" ") || "Zero"}${paise ? ` and ${underThousand(paise)} Paise` : ""} Only`;
}

export function buildSimplePdf(lines: string[]) {
  const pageLines: string[][] = [];
  for (let index = 0; index < lines.length; index += 48) pageLines.push(lines.slice(index, index + 48));
  if (!pageLines.length) pageLines.push([]);
  const objects: string[] = [];
  const kids = pageLines.map((_, index) => `${4 + index * 2} 0 R`).join(" ");
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${kids}] /Count ${pageLines.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  pageLines.forEach((page, index) => {
    const pageId = 4 + index * 2, contentId = pageId + 1;
    const stream = page.map((line, lineIndex) => `BT /F1 ${lineIndex === 0 && index === 0 ? 16 : 10} Tf 48 ${790 - lineIndex * 15} Td (${ascii(line)}) Tj ET`).join("\n");
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}\nendstream`;
  });
  let output = "%PDF-1.4\n%MAXPASE\n";
  const offsets: number[] = [0];
  for (let id = 1; id < objects.length; id++) { offsets[id] = Buffer.byteLength(output, "ascii"); output += `${id} 0 obj\n${objects[id]}\nendobj\n`; }
  const xrefOffset = Buffer.byteLength(output, "ascii");
  output += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) output += `${String(offsets[id]).padStart(10,"0")} 00000 n \n`;
  output += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(output, "ascii");
}

export function buildInvoicePdf(doc: InvoiceDoc) {
  const { invoice, supplier, customer, services, calculation } = doc;
  const bank = supplier.bank as Record<string, unknown> | undefined;
  const lines = [
    "TAX INVOICE - ORIGINAL FOR RECIPIENT",
    "AIRA Labs | AIRA SKILL CITY PRIVATE LIMITED",
    `Invoice number: ${invoice.invoiceNumber}`,
    `Invoice date: ${invoice.issueDate.toISOString().slice(0,10)}${invoice.dueDate ? `    Due date: ${invoice.dueDate.toISOString().slice(0,10)}` : ""}`,
    "",
    "SUPPLIER",
    amount(supplier.legalName),
    amount(supplier.registeredAddress),
    `Registered state: ${amount(supplier.registeredState)}    GSTIN: ${amount(supplier.gstin)}`,
    `Email: ${amount(supplier.email)}    Phone: ${amount(supplier.phone)}`,
    "",
    "BILL TO",
    amount(customer.legalName),
    amount(customer.businessName),
    amount(customer.billingAddress),
    `${amount(customer.state)} ${amount(customer.pinCode)}    GST status: ${amount(customer.gstRegistrationStatus)}`,
    `GSTIN: ${amount(customer.gstin)}    Place of supply: ${amount(customer.placeOfSupply)}`,
    "",
    "DESCRIPTION / SERVICE                                      SAC       QTY       UNIT PRICE (INR)",
    ...services.map(service => `${service.description} | ${service.serviceName ?? "AIRA Labs service"} | ${service.sacCode ?? "Not recorded"} | ${service.quantity} | ${service.rate}`),
    "",
    `Subtotal: INR ${amount(calculation.subtotal)}`,
    `Discount: INR ${amount(calculation.discount)}`,
    `Taxable value: INR ${amount(calculation.taxableValue)}`,
    `CGST: INR ${amount(calculation.cgst)}    SGST: INR ${amount(calculation.sgst)}    IGST: INR ${amount(calculation.igst)}`,
    `GST rate: ${Number(calculation.gstBasisPoints ?? 0) / 100}%    Place of supply: ${amount(calculation.placeOfSupply)}`,
    `TOTAL: INR ${amount(invoice.totalAmount)}`,
    `Amount in words: ${rupeesInWords(invoice.totalAmount)}`,
    "",
    "PAYMENT DETAILS",
    `Bank: ${amount(bank?.bankName)}    Account holder: ${amount(bank?.accountHolder)}`,
    `Account number: ${amount(bank?.accountNumber)}    IFSC: ${amount(bank?.ifsc)}    Branch: ${amount(bank?.branch)}`,
    amount(bank?.paymentInstructions),
    `Authorized signatory: ${amount(supplier.signatory)}`,
    "",
    "TERMS",
    amount(supplier.invoiceTerms),
    amount(supplier.documentFooter),
    "This invoice is generated from a recorded accepted quotation. Payment is not confirmed until reconciliation.",
  ];
  return buildSimplePdf(lines.map(line => line.length > 120 ? line.match(/.{1,120}/g)!.join("\n") : line).flatMap(line => line.split("\n")));
}
