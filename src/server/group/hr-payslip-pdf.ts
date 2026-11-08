import { buildSimplePdf } from "@/server/labs/invoice-pdf";

export type PayslipComponent = { label: string; kind: "EARNING" | "DEDUCTION"; amountPaise: string };
function inr(value: string | bigint) {
  const paise = BigInt(value), rupees = paise / 100n, fraction = String(paise % 100n).padStart(2, "0");
  return `INR ${Number(rupees).toLocaleString("en-IN")}.${fraction}`;
}
export function buildHrPayslipPdf(input: { companyName: string; period: string; employeeName: string; designation: string; components: PayslipComponent[]; grossPaise: string; deductionsPaise: string; netPaise: string; reviewReference: string }) {
  return buildSimplePdf([
    "CONFIDENTIAL PAYSLIP",
    input.companyName,
    `Pay period: ${input.period}`,
    `Employee: ${input.employeeName}`,
    `Role: ${input.designation}`,
    "",
    "EARNINGS",
    ...input.components.filter(item => item.kind === "EARNING").map(item => `${item.label}: ${inr(item.amountPaise)}`),
    `Gross pay: ${inr(input.grossPaise)}`,
    "",
    "DEDUCTIONS",
    ...input.components.filter(item => item.kind === "DEDUCTION").map(item => `${item.label}: ${inr(item.amountPaise)}`),
    `Total deductions: ${inr(input.deductionsPaise)}`,
    "",
    `NET PAY: ${inr(input.netPaise)}`,
    `Payroll review reference: ${input.reviewReference}`,
    "",
    "Generated from the approved payroll register. Confirm any statutory or tax treatment with the company's accountant.",
  ]);
}
