# Invoice DMS

Invoice generator and small document management system.

- **Stack:** Next.js 15, Neon Postgres (Drizzle ORM), Clerk login (2FA and passkeys), private Vercel Blob storage
- **Invoices:** clients, invoices with line items and tax, automatic numbering, status (draft, sent, paid, overdue, cancelled), payments, and a print/PDF layout matching the house design
- **Documents:** upload, categorise, tag and search files, and link them to clients and invoices. Downloads only go through a route that checks your login.
- **SVR import (optional):** on the New Invoice page, pick the client and upload one or more Site Visit Reports (PDF). Llama reads the date, time on and off site, tickets, site, and any expenses (taxi, cables, etc.). One "Support dd.mm.yyyy" line is added per visit, priced with the client's half-day, full-day or hourly rate (set on the Clients page). Visits with missing times are flagged. The SVRs are saved in Documents and linked to the invoice.

## Deploy on Vercel
1. Import this repo in Vercel.
2. **Storage tab:** add **Neon** (sets `DATABASE_URL`) and a **Blob** store with **private** access (sets `BLOB_READ_WRITE_TOKEN`).
3. **Integrations:** add **Clerk** (sets the Clerk keys), or create an app at dashboard.clerk.com and paste the keys from `.env.example`.
4. **In Clerk:** turn off public sign-ups (Restrictions, Allowlist), or set `ALLOWED_EMAILS` to your email. Turn on MFA.
5. **Optional:** set `LLAMA_API_URL`, `LLAMA_API_KEY` and `LLAMA_MODEL` for SVR import.
6. Deploy. The database migrations run automatically during the build (`vercel-build`).
7. Open **Settings** in the app and enter your company details, bank details (one `Key: value` per line), hourly rates and next invoice number.

## Local development
```bash
cp .env.example .env.local   # fill in values
npm install
npm run db:migrate
npm run dev
```
