import type { Metadata } from "next";
import { ClerkProvider, UserButton, OrganizationSwitcher } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = { title: "Invoice DMS", robots: { index: false, follow: false } };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  return (
    <ClerkProvider>
      <html lang="en">
        <body>
          {userId && (
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
              <OrganizationSwitcher hidePersonal={false} />
              <UserButton />
            </header>
          )}
          <main>{children}</main>
        </body>
      </html>
    </ClerkProvider>
  );
}
