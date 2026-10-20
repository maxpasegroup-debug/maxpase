import { getCountryCallingCode, isSupportedCountry, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { z } from "zod";

export const jobsPinInput = z.string().regex(/^[0-9]{6}$/, "Enter exactly six digits.");
export const jobsPhoneInput = z.object({
  country: z.string().length(2),
  nationalNumber: z.string().trim().min(4).max(24)
}).strict().transform(({ country, nationalNumber }, context) => {
  if (!isSupportedCountry(country as CountryCode)) {
    context.addIssue({ code: "custom", message: "Select a valid country." });
    return z.NEVER;
  }
  const parsed = parsePhoneNumberFromString(nationalNumber, country as CountryCode);
  if (!parsed?.isValid() || parsed.country !== country) {
    context.addIssue({ code: "custom", message: "Enter a valid phone number for the selected country." });
    return z.NEVER;
  }
  return parsed.number;
});

export function callingCode(country: CountryCode) { return `+${getCountryCallingCode(country)}`; }
