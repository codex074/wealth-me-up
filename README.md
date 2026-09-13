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

Apply the initial migration only once in a new local database. Use the printed local URL. The portable preview's `/signin-with-chatgpt?return_to=/` signs in as the isolated development identity; production authentication is managed by Sites.

## Product behavior

- Sample data is clearly marked and never automatically saved. Start your own portfolio with an empty account list.
- Account balances derive from opening balances, deposits, withdrawals, and purchases/sales including fees. Account currencies must match trades. Sales cannot exceed holdings.
- Moving weighted-average cost includes purchase fees; realized profit subtracts allocated cost and sale fees. THB/USD aggregation uses a user-entered valuation exchange rate, not transaction-date FX profit accounting.
- Asset prices are entered manually. If no valuation price has been saved, the latest recorded transaction price is used. There is no live market feed or broker trading connection.
- TFEX journal supports long/short futures, whole contracts, user-selected contract multipliers, open/close dates, notes, fees, net realized P&L and win rate. It does not calculate margin or options payoff. TFEX results are kept separate from cash balances to avoid double counting.
- Historical chart is a clearly labeled demonstration; real portfolios display the current valuation.
- Durable records are stored in D1, scoped to the authenticated user. Revision checks prevent another tab from silently overwriting newer data. Failed saves preserve the open form.

## Validation

```sh
node --experimental-strip-types --test tests/portfolio.test.ts
node node_modules/typescript/bin/tsc --noEmit
npm run build
```

Core files: `lib/portfolio.ts` (validation and accounting), `app/api/portfolio/route.ts` (owner-scoped persistence), `app/page.tsx` (dashboard), `app/portfolio-workspace.tsx` (records and forms).

## Self-hosted deployment (pve1)

Besides the OpenAI Sites publishing workflow (see AGENTS.md), the self-hosted deployment targets **wealth-me-up.codex074.com** on the owner's infrastructure. Setup is complete only when the dedicated tunnel is healthy, the hostname routes to the proxy, and authenticated save/reload has been verified.

- **Where**: the `docker` LXC (103) on Proxmox host `pve1`, alongside other self-hosted apps (`pharmshift`, etc.). No app code changes — the same Cloudflare Workers build (`wrangler dev --local`) runs as a long-lived container, backed by a local SQLite-based D1 emulation on a Docker volume instead of Cloudflare's real D1.
- **Access**: its own Cloudflare Tunnel (no ports opened on the host or router) gated by Cloudflare Access (sign-in restricted to the owner's email). A small Caddy container strips any client-supplied `oai-authenticated-user-*` headers and re-sets them from the Access-verified email, so `app/chatgpt-auth.ts` sees the same header contract it expects from OpenAI Sites — that file is untouched.
- **Files**: see `deploy/` — `Dockerfile`, `docker-compose.yml`, `Caddyfile`, `entrypoint.sh` (runs the once-only D1 migration, then `wrangler dev`), `setup-wizard.sh` (one-time Cloudflare Tunnel + Access setup), `redeploy.sh` (ship new changes to pve1).
- **To ship a change**: run `deploy/redeploy.sh` (needs SSH `root@pve1`). It packs the repo, rebuilds the image inside the LXC, and restarts the stack.
- **Owner identity**: the D1 `portfolios.owner` key is the Access-verified email recorded in `deploy/.env` (`OWNER_EMAIL`) — this is a fresh, empty portfolio, not a migration of any prior Sites-hosted data.
- **Known limitations**: `wrangler dev --local` is a dev server, not Cloudflare's production Workers runtime — acceptable for single-user private use, not for public traffic. `/signout-with-chatgpt` has no effect under Access; sign out via the Cloudflare Access session instead. Data lives only in the `wealth-me-up_wealth_me_up_data` Docker volume on pve1 — back it up separately.
- **Required tunnel validation**: enable **Protect with Access** on the public route, using team `broad-sky-a556` and the AUD from the Wealth Me Up Access application. This verifies JWTs before forwarding. Caddy also rejects missing or unexpected email identities and overwrites identity headers. Email headers alone do not prove authentication. Never expose the app or proxy through a published Docker port or an unprotected tunnel route.
- Keep `TUNNEL_TOKEN` and `OWNER_EMAIL` in ignored `deploy/.env` with mode `600`. The token belongs only to the dedicated `wealth-me-up` tunnel; do not reuse another app's token.
- `entrypoint.sh` sets the Worker's external origin to `https://wealth-me-up.codex074.com`; preserve this when changing the proxy or runtime, or same-origin browser saves will fail. After deploying, run `docker compose exec web node deploy/smoke-test.mjs OWNER_EMAIL` from the remote `deploy/` directory, replacing `OWNER_EMAIL` with the configured address. This checks identity rejection and origin handling with invalid bodies, without writing financial records. Separately verify the public hostname requires Cloudflare Access and the owner's browser can save/reload.
