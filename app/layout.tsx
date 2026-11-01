import type { Metadata } from "next";
import { Geist, Geist_Mono, Source_Serif_4 } from "next/font/google";
import Link from "next/link";
import { auth } from "@/lib/auth/server";
import { signOutAction } from "./sign-in/actions";
import { getCompany } from "@/lib/actions";
import NavLinks from "./NavLinks";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
const serif = Source_Serif_4({ subsets: ["latin"], weight: ["400"], variable: "--font-serif" });

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { default: "Overview · Invoices", template: "%s · Invoices" }, description: "Invoices, expenses and site visit reports", robots: { index: false, follow: false } };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = await auth.getSession();
  const user = session?.user;
  const company = user ? await getCompany("main").catch(() => null) : null;
  const name = company?.name || "Invoices";
  const initials = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} ${serif.variable}`}>
      <body>
        <a href="#content" className="skip">Skip to content</a>
        {user && (
          <header className="top no-print">
            <Link href="/" className="brand"><span className="mark">{initials}</span><span className="name">{name}</span></Link>
            <NavLinks elster={!!company?.elsterEnabled} />
            <span className="who">{user.email}</span>
            <form action={signOutAction}><button className="ghost small">Sign out</button></form>
          </header>
        )}
        <main id="content" tabIndex={-1}>{children}</main>
      </body>
    </html>
  );
}
