import { describe, expect, it } from "vitest";
import { quoteTotals } from "@/server/labs/input";
import { buildInvoicePdf } from "@/server/labs/invoice-pdf";
import { buildQuotationPdf } from "@/server/labs/quotation-pdf";

describe("AIRA billing calculation and document core", () => {
  it("calculates line totals, discount and GST with decimal arithmetic and rounding", () => {
    expect(quoteTotals({ leadId: "synthetic", currency: "INR", items: [{ description: "Automation", quantity: "1.5", rate: "100.01" }], discount: "0.02", taxBasisPoints: 1800, expiresAt: new Date("2027-01-01T00:00:00.000Z").toISOString() })).toEqual({ subtotal: "150.02", discount: "0.02", tax: "27.00", total: "177.00" });
  });
  it("builds a print-ready quotation PDF with legal supplier identity", () => {
    const pdf = buildQuotationPdf({ row: { id: "synthetic-quote", status: "ISSUED", dueAt: new Date("2027-01-01T00:00:00.000Z") }, data: { input: { items: [{ description: "Workflow automation", quantity: "1", rate: "100.00" }], currency: "INR", expiresAt: "2027-01-01T00:00:00.000Z" }, totals: { subtotal: "100.00", discount: "0.00", tax: "18.00", total: "118.00" }, issuer: { legalName: "AIRA SKILL CITY PRIVATE LIMITED", address: "Synthetic test address", taxRegistration: "SYNTHETIC" } }, customer: { company: "Synthetic customer", name: "Synthetic contact", email: "test@example.invalid", phone: "" } });
    expect(pdf.subarray(0, 8).toString("ascii")).toBe("%PDF-1.4");
    expect(pdf.toString("ascii")).toContain("AIRA SKILL CITY PRIVATE LIMITED");
    expect(pdf.toString("ascii")).toContain("INR 118.00");
  });
  it("builds invoice PDFs with GST components, bank details and amount in words", () => {
    const pdf = buildInvoicePdf({ invoice: { invoiceNumber: "ASK/INV/2026-27/0001", issueDate: new Date("2026-11-07T00:00:00.000Z"), dueDate: null, totalAmount: "118.00", status: "ISSUED" }, supplier: { legalName: "AIRA SKILL CITY PRIVATE LIMITED", registeredAddress: "Synthetic address", registeredState: "Synthetic State", gstin: "SYNTHETIC", signatory: "Synthetic signatory", bank: { bankName: "Synthetic bank", accountHolder: "Synthetic holder", accountNumber: "SYNTHETIC", ifsc: "SYNTHETIC", branch: "Synthetic" } }, customer: { legalName: "Synthetic buyer", billingAddress: "Synthetic billing address", state: "Synthetic State", pinCode: "000000", gstRegistrationStatus: "UNREGISTERED", placeOfSupply: "Synthetic State" }, services: [{ description: "Automation service", quantity: "1", rate: "100.00", serviceName: "Automation", sacCode: "SYNTHETIC" }], calculation: { subtotal: "100.00", discount: "0.00", taxableValue: "100.00", cgst: "9.00", sgst: "9.00", igst: "0.00", gstBasisPoints: "1800", placeOfSupply: "Synthetic State", total: "118.00" } });
    expect(pdf.subarray(0, 8).toString("ascii")).toBe("%PDF-1.4");
    expect(pdf.toString("ascii")).toContain("ASK/INV/2026-27/0001");
    expect(pdf.toString("ascii")).toContain("CGST: INR 9.00");
    expect(pdf.toString("ascii")).toContain("INR One Hundred Eighteen Only");
  });
});
