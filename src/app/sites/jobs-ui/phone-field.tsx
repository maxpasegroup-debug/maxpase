"use client";
import { useState } from "react";
import { getCountries, getCountryCallingCode, type CountryCode } from "libphonenumber-js";
import styles from "./auth.module.css";

const display = new Intl.DisplayNames(["en"], { type: "region" });
const countries = getCountries().map(code => ({ code, name: display.of(code) ?? code, dial: `+${getCountryCallingCode(code)}` })).sort((a, b) => a.code === "IN" ? -1 : b.code === "IN" ? 1 : a.name.localeCompare(b.name));

export function PhoneField({ prefix = "jobs" }: { prefix?: string }) {
  const [country, setCountry] = useState<CountryCode>("IN");
  return <div className={styles.field}>
    <label htmlFor={`${prefix}-number`}>Mobile number</label>
    <div className={styles.phoneRow}>
      <select className={styles.countrySelect} id={`${prefix}-country`} name="country" value={country} onChange={event => setCountry(event.target.value as CountryCode)} aria-label="Country and calling code" required>
        {countries.map(item => <option key={item.code} value={item.code}>{item.name} ({item.dial})</option>)}
      </select>
      <input id={`${prefix}-number`} name="nationalNumber" type="tel" inputMode="tel" autoComplete="tel-national" minLength={4} maxLength={24} placeholder="Mobile number" required />
    </div>
  </div>;
}
