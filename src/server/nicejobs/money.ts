import { z } from "zod";
import { NiceJobsError } from "./input";

export const MAX_MINOR = 9_000_000_000_000n;
export const currencyDigits = { INR: 2, USD: 2, EUR: 2, GBP: 2, AED: 2, JPY: 0, KWD: 3 } as const;
export const currency = z.enum(["INR", "USD", "EUR", "GBP", "AED", "JPY", "KWD"]);
export const minorInput = z.string().regex(/^(0|[1-9]\d{0,12})$/).refine(v => BigInt(v) <= MAX_MINOR, "Amount exceeds the technical bound");
export const decimalInput = z.string().regex(/^(0|[1-9]\d{0,9})(\.\d{1,12})?$/);
export function boundedMoney(value: bigint) { if (value < -MAX_MINOR || value > MAX_MINOR) throw new NiceJobsError("Amount exceeds the technical bound"); return value; }
export function toMinor(value: string, code: keyof typeof currencyDigits) {
  if (!/^(0|[1-9]\d*)(\.\d+)?$/.test(value)) throw new NiceJobsError("Enter a nonnegative decimal amount");
  const [whole, fraction = ""] = value.split("."), digits = currencyDigits[code];
  if (fraction.length > digits) throw new NiceJobsError("Currency precision exceeded");
  return boundedMoney(BigInt(whole) * 10n ** BigInt(digits) + BigInt(fraction.padEnd(digits, "0") || "0")).toString();
}
export function formatMinor(value: bigint | string, code: keyof typeof currencyDigits) {
  const amount = BigInt(value), sign = amount < 0n ? "-" : "", raw = (amount < 0n ? -amount : amount).toString(), digits = currencyDigits[code], padded = raw.padStart(digits + 1, "0");
  return sign + code + " " + (digits ? padded.slice(0, -digits) + "." + padded.slice(-digits) : padded);
}
export function rational(value: string) {
  decimalInput.parse(value); const [whole, fraction = ""] = value.split(".");
  return { numerator: BigInt(whole + fraction), denominator: 10n ** BigInt(fraction.length) };
}
export function compareDecimal(a: string, b: string) { const x = rational(a), y = rational(b), d = x.numerator * y.denominator - y.numerator * x.denominator; return d < 0n ? -1 : d > 0n ? 1 : 0; }
export function roundRatio(numerator: bigint, denominator: bigint, mode: "FLOOR" | "CEILING" | "HALF_UP") {
  if (numerator < 0n || denominator <= 0n) throw new NiceJobsError("Invalid monetary ratio");
  const quotient = numerator / denominator, remainder = numerator % denominator;
  return boundedMoney(quotient + (mode === "CEILING" && remainder > 0n || mode === "HALF_UP" && remainder * 2n >= denominator ? 1n : 0n));
}
