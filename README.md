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
