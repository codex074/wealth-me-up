# Wealth Me Up

A private Thai-language investment journal for THB and USD assets, multiple cash accounts, brokers, and TFEX futures.

## Run locally

```sh
npm run install:ci
npm run db:generate # only after changing db/schema.ts
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_bumpy_tombstone.sql
npm run dev
```

Apply the initial migration only once in a new local database. Use the printed local URL.

Sign-in is Google OAuth handled by the app. Create `.dev.vars` in the repo root (ignored by git) before `npm run dev`:

```
GOOGLE_CLIENT_ID=…
GOOGLE_CLIENT_SECRET=…
SESSION_SECRET=…        # openssl rand -base64 32
ALLOWED_EMAILS=you@example.com
APP_ORIGIN=http://localhost:5173
```

The Google OAuth client must list `http://localhost:5173/auth/google/callback` as an authorized redirect URI (`deploy/setup-wizard.sh` walks through creating it). Without `.dev.vars` the app still builds and serves `/login`, but signing in returns "ระบบยังไม่ได้ตั้งค่าการเข้าสู่ระบบ".

## Product behavior

- A new portfolio starts empty; there is no sample data. Add platforms and cash accounts first, then record trades.
- Account balances derive from opening balances, deposits, withdrawals, and purchases/sales including fees. Account currencies must match trades. Sales cannot exceed holdings.
- Moving weighted-average cost includes purchase fees; realized profit subtracts allocated cost and sale fees. THB/USD aggregation uses a user-entered valuation exchange rate, not transaction-date FX profit accounting.
- Asset prices are entered manually. If no valuation price has been saved, the latest recorded transaction price is used. There is no live market feed or broker trading connection.
- TFEX journal supports long/short futures, whole contracts, user-selected contract multipliers, open/close dates, notes, fees, net realized P&L and win rate. It does not calculate margin or options payoff. TFEX results are kept separate from cash balances to avoid double counting.
- TFEX PDF import: open **บันทึกการเทรด TFEX → นำเข้า PDF จาก Pi**, select a PDF, enter its password if required, review the rows and choose a broker (or create Pi Securities with the import), then save. It accepts Pi text-based daily confirmations up to 10 MB and two pages for S50 quarterly futures (200 THB/point) and USD Futures (1,000 THB/point). Multiple opening cost lots can reconcile to one closing execution; a second continuation/signature page and the outstanding-position table are excluded from the closing ledger. Other brokers, scanned PDFs, options and unsupported contracts are rejected with an explanation. Files and passwords are processed in the browser with bundled PDF.js; neither is uploaded or retained.
- The importer reconciles closing groups and checks gross P&L, quantities, commission + VAT, and document totals before accepting the entire file. A buy-to-close is a SHORT position. Matching open journal lots are consumed FIFO (or split for a partial close) with proportional opening fees and notes preserved. Insufficient existing quantities, mismatched dates/prices and possible manual duplicates require correcting the ledger first. Import statements in trading-date order; an older opening statement cannot recreate an already closed lot.
- A closing statement does not supply historical opening fees. If no matching open record exists, each closing row requires an explicitly entered opening fee (including VAT; enter 0 only if appropriate). Net P&L remains unavailable in preview until those fees are entered. Import never changes cash or margin balances. A SHA-256 fingerprint of the Pi document number is saved in optional `tfexImports` metadata to block repeat imports even after renaming the file or editing its records. Existing JSON payloads without that field stay compatible; no SQL migration is needed. Review before saving; failed saves retain the preview and inputs, and stale revisions still require reloading the latest portfolio.
- There is no historical chart yet; the growth panel shows the current valuation only.
- Sign-in is Google only, restricted to the emails in `ALLOWED_EMAILS`; everything except `/login` and the `/auth/*` routes requires a session. Sessions are signed cookies valid for 30 days; rotating `SESSION_SECRET` signs everyone out. Durable records are stored in D1, scoped to the signed-in email (lowercased). Revision checks prevent another tab from silently overwriting newer data. Failed saves preserve the open form.

## Validation

```sh
node --experimental-strip-types --test tests/portfolio.test.ts
node --experimental-strip-types --test tests/auth.test.ts
node --experimental-strip-types --test tests/pi-tfex.test.ts
node node_modules/typescript/bin/tsc --noEmit
npm run build
```

Core files: `lib/portfolio.ts` (validation and accounting), `app/api/portfolio/route.ts` (owner-scoped persistence), `app/dashboard.tsx` (dashboard), `app/page.tsx` (sign-in gate), `app/portfolio-workspace.tsx` (records and forms), `app/auth.ts` and `lib/auth/` (Google login, sessions, allowlist).

## Self-hosted deployment (pve1)

The app runs at **wealth-me-up.codex074.com** on the owner's infrastructure. Setup is complete only when the tunnel is healthy, the app's own login page appears at the hostname, and an allowed Google account can sign in, save, and reload.

- **Where**: the `docker` LXC (103) on Proxmox host `pve1`. The Cloudflare Workers build runs as a long-lived container (`wrangler dev --local`) backed by a SQLite-based D1 emulation on a Docker volume.
- **Access**: a dedicated Cloudflare Tunnel forwards the hostname straight to `wealth-me-up-web:8787`. Cloudflare Access is **not** used; the app authenticates people with Google and only accepts emails in `ALLOWED_EMAILS`. Do not re-enable "Protect with Access" on the route or people will sign in twice.
- **Files**: `deploy/Dockerfile`, `docker-compose.yml` (web + cloudflared), `entrypoint.sh` (writes `dist/server/.dev.vars` from the container environment, runs the once-only D1 migration, then `wrangler dev`), `setup-wizard.sh` (Google OAuth client, secrets, tunnel change), `redeploy.sh` (ship changes), `smoke-test.mjs`.
- **Secrets**: `deploy/.env` (ignored, mode 600) holds `TUNNEL_TOKEN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `ALLOWED_EMAILS`, `APP_ORIGIN`. Compose passes the auth values into the `web` container; `entrypoint.sh` turns them into the Worker's `.dev.vars`.
- **To ship a change**: `deploy/redeploy.sh` (needs SSH `root@pve1`). To add a user: append the email to `ALLOWED_EMAILS`, add the same email as a test user on the Google consent screen (Cloud project `wealth-me-up-508615`, Google Auth Platform → Audience), then redeploy. To sign everyone out: rotate `SESSION_SECRET` and redeploy.
- **Google side**: the OAuth client and consent screen live in Cloud project `wealth-me-up-508615`. The image installs `ca-certificates` because workerd verifies Google's TLS certificate against the system store; without it every login ends at `/login?error=failed`.
- **Cloudflare side**: the route is a "published application" on the tunnel (Cloudflare dashboard → Networking → Tunnels → `wealth-me-up` → Routes); Cloudflare created the CNAME. The Zero Trust pages are under `dash.cloudflare.com/<account>/one/…`; no Access application may exist for this hostname.
- **Owner identity**: `portfolios.owner` is the lowercased Google email.
- **Verify after deploy**: from the remote `deploy/` directory run `docker compose exec web node deploy/smoke-test.mjs` (checks anonymous redirects, forged cookies, legacy header spoofing, cross-origin logout, and that Google login is configured, without writing records). Then sign in from a browser with an allowed account and with a non-allowed account (expect "ไม่มีสิทธิ์ใช้งาน").
- **Known limitations**: `wrangler dev --local` is a dev server, not Cloudflare's production runtime; acceptable for private allowlisted use. Data lives only in the `wealth-me-up_wealth_me_up_data` Docker volume on pve1; back it up separately. Google's OAuth consent screen in "Testing" mode limits sign-in to listed test users and expires refresh tokens, which does not matter here because the app never calls Google after login.
