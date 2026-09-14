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
- There is no historical chart yet; the growth panel shows the current valuation only.
- Sign-in is Google only, restricted to the emails in `ALLOWED_EMAILS`; everything except `/login` and the `/auth/*` routes requires a session. Sessions are signed cookies valid for 30 days; rotating `SESSION_SECRET` signs everyone out. Durable records are stored in D1, scoped to the signed-in email (lowercased). Revision checks prevent another tab from silently overwriting newer data. Failed saves preserve the open form.

## Validation

```sh
node --experimental-strip-types --test tests/portfolio.test.ts
node --experimental-strip-types --test tests/auth.test.ts
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
- **To ship a change**: `deploy/redeploy.sh` (needs SSH `root@pve1`). To add a user: append the email to `ALLOWED_EMAILS` and redeploy. To sign everyone out: rotate `SESSION_SECRET` and redeploy.
- **Owner identity**: `portfolios.owner` is the lowercased Google email. The portfolio created under Cloudflare Access used the same email, so it carries over.
- **Verify after deploy**: from the remote `deploy/` directory run `docker compose exec web node deploy/smoke-test.mjs` (checks anonymous redirects, forged cookies, legacy header spoofing, cross-origin logout, and that Google login is configured, without writing records). Then sign in from a browser with an allowed account and with a non-allowed account (expect "ไม่มีสิทธิ์ใช้งาน"). While the Google consent screen is in Testing mode, a second account must be listed as a test user there, or Google blocks it before the app's allowlist runs.
- **Known limitations**: `wrangler dev --local` is a dev server, not Cloudflare's production runtime; acceptable for private allowlisted use. Data lives only in the `wealth-me-up_wealth_me_up_data` Docker volume on pve1; back it up separately. Google's OAuth consent screen in "Testing" mode limits sign-in to listed test users and expires refresh tokens, which does not matter here because the app never calls Google after login.
