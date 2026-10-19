import Link from "next/link";
import { CalendarCheck, GraduationCap, ListChecks, ChartNoAxesColumn, Wallet, Library, CircleHelp } from "lucide-react";
import { participantSections, participantSection } from "@/lib/participant-navigation";

const icons = [CalendarCheck, GraduationCap, ListChecks, ChartNoAxesColumn, Wallet, Library, CircleHelp];
export function ParticipantNav({ base, view = "my-day" }: { base: string; view?: string }) {
  return <nav className="nj-participant-nav" aria-label="Your workspace">{participantSections.map(([key, label], i) => {
    const Icon = icons[i];
    return <Link key={key} href={`${base}?view=${key}`} aria-current={participantSection(view) === key ? "page" : undefined}><Icon size={18} aria-hidden="true" />{label}</Link>;
  })}</nav>;
}
