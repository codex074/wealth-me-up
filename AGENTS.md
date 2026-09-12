# Wealth Me Up — agent guide

## Product intent

Build a private, Thai-first investment journal for assets, broker/platform records, multiple cash accounts, and TFEX futures. Keep user-facing copy and task updates in Thai; retain established English financial terms and code identifiers where appropriate.

Before changing accounting behavior, read [Product behavior](README.md#product-behavior). Manual prices, the user-entered valuation exchange rate, and the demonstration chart are explicit product boundaries. Keep these distinctions visible when changing the interface.

## Where to work

- For portfolio validation, cost basis, balances, or TFEX results, start with [lib/portfolio.ts](lib/portfolio.ts) and [tests/portfolio.test.ts](tests/portfolio.test.ts). Keep shared calculations there so forms, summaries, and server validation agree.
- For dashboard presentation and navigation, use [app/page.tsx](app/page.tsx). For record lists and entry/edit forms, use [app/portfolio-workspace.tsx](app/portfolio-workspace.tsx). Reuse the installed primitives in `components/ui/` and the theme in [app/globals.css](app/globals.css).
- For saved state and concurrency, read [app/api/portfolio/route.ts](app/api/portfolio/route.ts). For identity handling, read [app/chatgpt-auth.ts](app/chatgpt-auth.ts).
- For database changes, inspect [db/schema.ts](db/schema.ts) and the existing `drizzle/` migrations. For local setup or sign-in, follow [Run locally](README.md#run-locally); the package scripts remain the source of truth for commands.

## Accounting rules

- Derive holdings and cash from the ledger. Preserve moving weighted-average cost, purchase fees in cost basis, and sale fees in realized profit.
- Revalidate the resulting portfolio after edits and backdated transactions. Check available holdings in transaction order, linked account/platform existence, matching account currency, and final account balances.
- Keep amounts in their native account currency. Apply the valuation FX rate when aggregating; changing display currency or FX must not rewrite transaction amounts. Historical FX gains require a separate, explicitly requested model.
- Preserve asset identity by symbol, currency, and platform. Identical tickers on different platforms must not merge accidentally.
- Keep TFEX journal P&L separate from cash and portfolio totals. Use each record's direction, whole contract quantity, multiplier, and total fees. Open positions have no realized P&L and are excluded from win rate; break-even closes are not wins.
- Keep demonstration data out of saved portfolios. Starting a real portfolio uses an empty ledger.

## Persistence and access

- Use authenticated server identity for ownership on every read and write. Preserve owner-scoped prepared SQL, server-side validation, and private access.
- Preserve revision-based updates and conflict responses. A stale client must reload current data instead of silently overwriting another tab's changes.
- Keep form input available after a failed save. Update the displayed saved state only after the server confirms success. Browser storage is reserved for device preferences, not authoritative financial records.
- D1 currently stores a portfolio JSON payload per owner. When changing its shape, handle existing payloads with compatible defaults or an explicit migration; a SQL schema migration alone does not update JSON records.
- Generate and inspect migrations for SQL schema changes. Preserve applied migration history and keep production schema changes out of request handlers. Local migration state is separate from production.
- Use synthetic financial data for verification and keep credentials, account details, and local database files out of committed fixtures and logs.

## Interface and runtime

Preserve the Thai interface, green palette, and responsive workspace layout. When changing forms or navigation, verify keyboard labels/focus, mobile menu dismissal, table scrolling, and recoverable save errors. Prices and charts must reflect their stated data source.

The app uses Vinext's Next-compatible interface on Vite and Cloudflare Workers. Preserve the existing framework scripts, npm lockfile, and Sites build integration. Server code must work in the Worker runtime; local Node-only utilities belong outside request handlers.

## Verify and hand off

Use the commands in [Validation](README.md#validation), scoped to the change:

- Accounting changes: add focused cases to the existing suite and run it, including affected currency, fee, partial-sale, backdated, or TFEX cases. Compare balances and results against explicit expected amounts.
- Application code changes: run the TypeScript check and production build. For persistence changes, verify save/reload behavior and the affected authentication or conflict path using the local database.
- UI changes: exercise the changed flow at desktop and mobile sizes, including its empty and failure states when affected.
- Documentation-only changes: verify referenced paths, commands, and consistency with the implementation; an application build or deployment is unnecessary.

For website publishing, follow the available Sites workflow, reuse the project identity in `.openai/hosting.json`, and preserve the current audience. Confirm terminal deployment success before reporting a live URL. Never record deployment credentials in source or Git configuration.

In the handoff, state what changed, what was verified, and any remaining limitation. Update `README.md` when product behavior or setup changes; keep this file focused on decisions future agents need.
