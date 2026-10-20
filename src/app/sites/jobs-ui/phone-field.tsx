"use client";
import { useMemo, useState } from "react";
import { getCountries, getCountryCallingCode, type CountryCode } from "libphonenumber-js";
import styles from "./auth.module.css";

const display = new Intl.DisplayNames(["en"], { type: "region" });
const countries = getCountries().map(code => ({ code, name: display.of(code) ?? code, dial: `+${getCountryCallingCode(code)}` })).sort((a, b) => a.name.localeCompare(b.name));

export function PhoneField({ prefix = "jobs" }: { prefix?: string }) {
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState<CountryCode>("IN");
  const filtered = useMemo(() => countries.filter(item => `${item.name} ${item.code} ${item.dial}`.toLowerCase().includes(search.toLowerCase())).slice(0, 80), [search]);
  return <div className={styles.field}>
    <label htmlFor={`${prefix}-country-search`}>Country or calling code</label>
    <input id={`${prefix}-country-search`} type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search country or code" autoComplete="off" />
    <select className={styles.countrySelect} id={`${prefix}-country`} name="country" value={country} onChange={event => setCountry(event.target.value as CountryCode)} aria-label="Country and calling code" required>
      {filtered.some(item => item.code === country) ? null : <option value={country}>{countries.find(item => item.code === country)?.name} ({`+${getCountryCallingCode(country)}`})</option>}
      {filtered.map(item => <option key={item.code} value={item.code}>{item.name} ({item.dial})</option>)}
    </select>
    <label htmlFor={`${prefix}-number`}>Phone number</label>
    <div className={styles.phoneRow}><span aria-label="Selected calling code">+{getCountryCallingCode(country)}</span><input id={`${prefix}-number`} name="nationalNumber" type="tel" inputMode="tel" autoComplete="tel-national" minLength={4} maxLength={24} placeholder="National number" required /></div>
  </div>;
}
