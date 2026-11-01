# Deployment plan

## Environments
| Env | Branch | Database | URL |
|---|---|---|---|
| Production | `main` | Neon main branch | your domain, e.g. invoices.ibrar.eu |
| Preview | any PR branch | Neon branch created per preview (automatic) | *.vercel.app, protected |

## One-time setup (about 20 minutes)
1. **Vercel:** Add New Project, import `ibrardu/invoice-dms`. Framework is detected as Next.js. Do not deploy yet.
2. **Neon:** Project, Storage, Create Database, Neon. Region `Frankfurt (eu-central-1)`, close to Hamburg and GDPR friendly. Enable "Create database branch for each preview deployment". This sets `DATABASE_URL`.
3. **Blob:** Storage, Create, Blob, access **Private**, region Frankfurt. This sets `BLOB_READ_WRITE_TOKEN`.
4. **Clerk:** Integrations, Clerk (or dashboard.clerk.com, then paste the keys).
   - Restrictions: turn on **Allowlist**, add `ibrar@ibrar.eu`, and turn off public sign-up.
   - Multi-factor: turn on **Authenticator app** and **Passkeys**, and make MFA required.
   - Sessions: lifetime 7 days, inactivity timeout 12 hours.
   - Create a production instance when moving to your own domain.
5. **Environment variables** (Production and Preview):
   - `ALLOWED_EMAILS=ibrar@ibrar.eu` (second safety net next to the Clerk allowlist)
   - `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up`
   - `LLAMA_API_URL`, `LLAMA_API_KEY`, `LLAMA_MODEL` (see .env.example)
6. **Deploy.** `vercel-build` runs `drizzle-kit migrate`, then `next build`, so tables are created automatically.
7. **Domain:** Settings, Domains, add `invoices.ibrar.eu` and add the CNAME at your DNS provider. Add the same domain in Clerk production.
8. **Deployment Protection:** turn on Vercel Authentication for previews.
9. **First login:** go to Settings and fill in company details, bank details (`Bank: Wise` / `IBAN: ...` / `SWIFT: ...`), prefix `#`, next number `61927`. Then add clients with their pricing mode and rates.

## Release flow
- Work on a branch and open a PR. Vercel builds a preview with its own Neon branch; test there.
- Merge to `main`. Production deploys automatically and migrations run.
- Schema change: edit `lib/schema.ts`, run `npm run db:generate`, then commit the new file in `drizzle/`.
- Rollback: Vercel, Deployments, Instant Rollback (only safe if the migration was additive).

## Backups and security
- Neon keeps point-in-time restore (7 days on free, longer on paid). Before big changes, create a Neon branch as a snapshot.
- Monthly: export invoices as PDF, and download the Neon dump with `pg_dump "$DATABASE_URL" > backup.sql`.
- Every page and API route checks the Clerk session. Every query is scoped to your tenant. Files are private Blobs served only through `/api/documents/[id]` after an auth check. HSTS and frame denial headers are set.
- Rotate the `LLAMA_API_KEY` and Clerk secret if they are ever shared.

## Costs (start)
Vercel Hobby, Neon Free, Clerk Free and Blob (1 GB free) are all EUR 0 for one user. The Llama API costs a few cents per SVR.
Note: Vercel Hobby is for non-commercial use. For business invoicing, Vercel Pro is USD 20 per month.
