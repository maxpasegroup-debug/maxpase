import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MAXPASE GROUP | Education, enterprise & innovation",
  description: "MAXPASE GROUP brings AIRA Skill City, PEARN and Top Rank AI together through a shared operating system."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
