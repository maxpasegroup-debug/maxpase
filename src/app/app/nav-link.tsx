"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
export default function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const active = usePathname() === href;
  return <Link href={href} className={"nav-item" + (active ? " active" : "")} aria-current={active ? "page" : undefined}>{children}</Link>;
}

