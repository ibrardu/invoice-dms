import type { Metadata } from "next";
import { auth } from "@/lib/auth/server";
import { signOutAction } from "./sign-in/actions";
import Link from "next/link";
import "./globals.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Invoice DMS", robots: { index: false, follow: false } };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = await auth.getSession();
  const user = session?.user;
  return (
      <html lang="en">
        <body>
          {user && (
            <header className="top no-print">
              <span className="brand">Invoice DMS</span>
              <nav>
                <Link href="/">Dashboard</Link>
                <Link href="/invoices">Invoices</Link>
                <Link href="/clients">Clients</Link>
                <Link href="/documents">Documents</Link>
                <Link href="/export">Export</Link>
                <Link href="/settings">Settings</Link>
              </nav>
              <span className="muted">{user.email}</span>
              <form action={signOutAction}><button className="ghost">Sign out</button></form>
            </header>
          )}
          <main>{children}</main>
        </body>
      </html>
  );
}
