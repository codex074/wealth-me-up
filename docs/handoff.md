# Handoff log

Newest entry first. Each entry records what changed, what was verified, and what is still open, so the next agent (Codex or Claude) can continue without re-deriving state. Append a new entry at the top when you finish a session that changes product behavior or infrastructure.

## 2026-09-15 — TFEX cumulative realized P&L chart with a period filter (Claude)

**Changed**: Added a cumulative realized-P&L line chart to the TFEX page (`app/portfolio-workspace.tsx`, new `TfexPnlChart` component), below the existing stat cards and above the existing trades table. Two new pure functions in `lib/portfolio.ts`: `tfexPnlSeries(data, scope)` (running sum of `tfexPnl` bucketed by each trade's `closeDate`, never the open `date`; same-day closes collapse into one point; "year"/"quarter" scopes anchor at 0 on the period's first day unless a real close already lands exactly there) and `availableTfexPeriods(data)` (years/quarters that actually have a closed trade, most-recent-first, for the period dropdown). Three view modes — ทั้งหมด (all-time, default), รายปี, ไตรมาส — reusing the `.range-tabs`/`Tabs` pattern; a `Select` dropdown appears for the latter two, defaulting to the most recent period with data. The period filter scopes only this chart; the stat cards and trades table always read the unfiltered `summarize(data)`. `recharts` (already a dependency, previously unused anywhere in the app) renders the chart directly (no `components/ui/chart.tsx` wrapper, to keep this app's bespoke CSS look) — a single green line (`#50774a`) plus a dashed zero baseline (`#b8c6b4`), reusing the `.panel.performance`/`.chart-wrap`/`.chart-legend` CSS that existed but was unused. A CVD check on this app's `.positive`/`.negative` colors as a two-tone fill failed (ΔE 4.6), so polarity is conveyed by line position vs. the zero baseline and the signed tooltip/headline number, never by hue alone. Reworded the "no historical chart" line in `README.md`/`AGENTS.md` to scope it to asset *valuation* (no price history exists) — this new chart is a documented exception because it charts an already-known ledger fact.

**Verified**: 17 new `node --test` cases in `tests/portfolio.test.ts` (same-day collapse, empty scopes, year/quarter anchor placement including the anchor-omitted boundary case, year-rollover bucketing by close date not open date, mixed-sign running totals, period-list dedup/ordering) — 50/50 total pass; `tsc --noEmit` clean; lint at the same 3 pre-existing errors; production build clean. Manually exercised in the local dev build against the existing local D1 data (54 closed trades across 2024/2026, synthetic, not the real owner's data): all three modes, the period dropdown populating only non-empty periods and defaulting to the most recent, the tooltip/crosshair, and mobile width (400px) — the panel heading wraps title → dropdown → mode tabs onto separate rows with zero new CSS, using the already-existing `.performance .panel-heading{flex-wrap:wrap}` mobile rule.

**Limits**: recharts spaces the x-axis by index, not elapsed calendar time, so a period with many closes spreads wider than one with few — expected for a ledger-event chart, not a bug. No per-trade drill-down from a chart point (hover shows the day's total only; the existing trades table below still lists every individual trade). Not deployed to pve1 yet.

## 2026-09-15 — Pi import accepts multiple PDF files at once (Claude)

**Changed**: `TfexImportDialog` now takes `<input type="file" multiple>` with one shared password field. New `prepareTfexImportBatch` in `lib/portfolio.ts` sorts the successfully-read statements by trading date and folds `prepareTfexImport` over them so a close in a later document can match an open lot created by an earlier one in the same batch; a statement that fails to read or fails validation (wrong password, corrupt file, duplicate document) is skipped with its reason shown and the rest of the batch still applies. Fixed a latent bug this exposed: reusing the `"__new_pi__"` new-broker sentinel across a loop would have created one "Pi Securities" platform per file — the batch now pins the platform id created by the first successful statement for the rest of the batch. The preview screen groups rows per file, and one `save()` call commits the whole batch (single revision bump). Opening-fee input keys became `"<statement fingerprint>:<row index>"` since rows now come from multiple documents.

**Verified**: added 3 focused tests to `tests/pi-tfex.test.ts` (chronological cross-document matching, the platform-sentinel fix, skip-and-continue on a duplicate) — 41/41 total pass, `tsc`, lint (same 3 pre-existing errors), and production build all clean. Manually exercised in the local dev build (synthetic session, hand-built text-PDF fixtures, no real owner data): multi-select, a two-file cross-document close producing the exact expected fee/P&L, the skip-with-reason banner on a mixed valid+duplicate selection, and layout/table-scroll at 400px width.

**Limits**: same per-file limits as before (Pi text PDF, 10 MB, two pages). No per-file removal from a batch before reading; a bad file must be re-selected without it.

**Deployment**: commit `e7261e3` shipped to pve1 / LXC 103 with `deploy/redeploy.sh`. Post-deploy smoke test passed 7/7, public `/login` returned 200, and deployed `lib/portfolio.ts` / `app/tfex-import-dialog.tsx` SHA-256 hashes match the local files. The owner's live portfolio was not touched.

## 2026-09-15 — Pi import adds USD Futures and two-page statements (Codex)

**Changed**: Expanded the Pi TFEX PDF adapter from S50-only, one-page statements to text-based statements up to two pages containing S50 quarterly futures (200 THB/point) and USD Futures (1,000 THB/point). Execution IDs now accept and validate Pi's observed `BU`/`BH`/`SE`/`SH` prefixes against Long/Short and Open/Close. The closing parser stops before `OUTSTANDING POSITION`, supports one closing execution that closes several opening cost lots, and calculates/checks each lot plus the printed group/statement totals. Ledger reconciliation now consumes multiple identical open lots FIFO, allocates their opening fees proportionally, preserves their notes, and leaves any unclosed remainder intact.

**Verified**: All 57 encrypted PDFs supplied under `pi_tfex_2024/Pi_DCF` parsed with PDF.js: 35 one-page and 22 two-page files, 246 extracted rows across S50U24, S50Z24, S50U26, and USDU24. A chronological synthetic-ledger rehearsal imported all 48 unique documents without failure; 9 duplicate copies were blocked by fingerprint, and all 109 final ledger rows were closed with no orphan open lots. Missing historical fees were set to zero only inside this rehearsal, not saved anywhere. A real two-page mixed S50/USDU24 file rendered correctly in desktop and mobile browser previews without issuing a save. Synthetic/accounting/auth tests pass 38/38; TypeScript, lint, diff check, and production build pass. No source PDF, password, extracted personal data, or test portfolio was committed or saved to the live app.

**Limits**: Import still supports Pi text PDFs only, max 10 MB and two pages; no OCR, options, other brokers, or other futures products. A closing lot with no matching imported/open ledger row still requires the user to enter its historical opening fee explicitly.

**Deployment**: Feature commit `bd10174` and deploy-build fix `da81f75` shipped to pve1 / LXC 103. The first Docker build was cgroup OOM-killed (exit 137) during the client build: LXC RAM is 4 GB, active swap inside the guest is 0, and the killed Node process used about 1.46 GB RSS while other services were active. Disk had 9.7 GB free and the container had no separate memory limit. `deploy/Dockerfile` now runs only the build with `NODE_OPTIONS=--max-old-space-size=768`; that value passed locally and the repeat remote build completed without stopping unrelated services. Post-deploy smoke test passed 7/7, public `/login` returned 200, and deployed parser/reader SHA-256 hashes match the local files. The live owner's portfolio was not modified.

## 2026-09-15 — Pi TFEX PDF import reviewed, hardened, committed, deployed (Claude)

**Changed**: Codex's uncommitted import feature was committed as-is (`0736ce0`), then an independent review (no Critical findings) led to five fixes, one commit each (`6de7c67`..`937336f`):
- A close row that has no exact match but an open lot of the same platform/symbol/side exists now blocks the import with a Thai error instead of silently adding a second closed record and leaving the manual lot open.
- Same-day open+close in one document: the consumed open row is marked "รวมกับรายการปิดแล้ว" and the save button counts only rows that will be saved (`savedCount`).
- `tfexImports` entries are now `{key, tradeIds}` (legacy bare strings still accepted and still block); a document can be re-imported once every trade it created has been deleted.
- Total-line tolerance is `0.005 × rows + 0.01` (per-row `charge = commission + VAT` stays strict), so broker VAT rounding on multi-fill statements no longer rejects the file.
- The document fingerprint is `sha256("pi:" + ownerEmail + ":" + documentNo)`; the salt flows `app/dashboard.tsx` → `TfexImportDialog salt` → `readTfexPdf` → `parsePiTfex`. No real imports existed before this change, so no migration.

**Verified**: 34/34 tests (7 new, each RED before its fix), `tsc` clean, lint at the same 3 pre-existing errors, build clean; scoped re-review confirmed all five addressed with no new breakage. Deployed with `deploy/redeploy.sh`; pve1 source hashes match `937336f`; smoke test 7/7; owner's live portfolio (3 platforms, revision 3, no TFEX rows) loads.

**Still open (non-blocking)**: no dedicated rounding test for the POSITION CLOSING total line; consumed preview rows hide the original entry price; `isEvalSupported:false` / `disableFontFace:true` not yet passed to PDF.js; if a CSP is ever added it must include `worker-src blob:`; the SSR bundle carries the 1.27 MB PDF worker chunk it never evaluates; `@napi-rs/canvas` optional binaries are installed in the image for nothing.

## 2026-09-14 — Pi TFEX PDF import (Codex)

**Changed**: Added `บันทึกการเทรด TFEX → นำเข้า PDF จาก Pi` with password input, browser-only PDF.js extraction, review, broker selection/atomic Pi creation, explicit missing opening fees, and one revision-checked save. `lib/pi-tfex.ts` strictly parses one-page Pi text confirmations for quarterly S50 futures and reconciles buy/sell-to-close direction, paired entries, contract counts, gross P&L and fees including VAT. `prepareTfexImport` in `lib/portfolio.ts` consumes a unique matching open lot, preserves notes, and proportionally allocates opening fees on partial closes. Import leaves cash untouched. Optional `tfexImports` fingerprints block repeat documents; old payloads need no migration. PDF/password/customer identifiers are not persisted.

**Verified locally**: 27 accounting/parser/auth tests; TypeScript; production build; real supplied encrypted PDF read-only (three SHORT closures with reconciled totals). Synthetic encrypted PDF browser flows in both Vite dev and the local production build: wrong-password recovery, explicit opening fees, 503 retention/retry, real local D1 save/reload, stale revision 409, duplicate re-import after reload, unsupported multi-page rejection, desktop/mobile layout, horizontal table scroll, menu dismissal and Escape. No real portfolio was imported. Lint remains at the same three pre-existing errors recorded below.

**Implementation note**: PDF.js worker is lazy-loaded as raw packaged source into a Blob worker. Vite's dev rewriting of a worker URL imported its window-dependent HMR client, causing an overlay and fake-worker fallback; raw source removes that injection. Production build reports the expected large lazy PDF worker chunk (loaded only when reading a PDF).

**Limits**: Pi, text PDF, one page, max 10 MB, quarterly S50 futures only. No OCR/options/other brokers or multipage layouts yet. Missing opening fees must be explicitly entered; do not assume the daily close fee includes historical opening fees. Import in date order. Ambiguous lots, incompatible existing quantities and possible manual duplicates stop the entire import for ledger correction. Fingerprints remain after editing imported trades; corrected/reissued versions of the same document are blocked for manual review.

**Deployment**: shipped the current working tree with `deploy/redeploy.sh` to pve1 / LXC 103. Post-deploy `docker compose exec -T web node deploy/smoke-test.mjs` passed 7/7; public `/login` returned 200. Authenticated import/save was exercised on the local production build with synthetic owners, not against the real owner's live portfolio. Source changes are uncommitted in this checkout. Temporary extracted customer PDF text/images and local synthetic test rows were removed.

## 2026-09-14 — Google login replaces Cloudflare Access; sample data removed (Claude)

**Live state right now**

- `https://wealth-me-up.codex074.com` serves the app with its own Google login. Verified by the owner signing in from a browser and by `deploy/smoke-test.mjs` (7/7) inside the `web` container.
- pve1 → LXC 103 → `/opt/wealth-me-up/deploy` runs two containers: `wealth-me-up-web` (wrangler dev, port 8787) and `wealth-me-up-cloudflared`. The Caddy proxy container is gone.
- Cloudflare: tunnel `wealth-me-up` (id `9486e8e7-…`) has one published-application route `wealth-me-up.codex074.com → http://wealth-me-up-web:8787`, Access off. The old Access application "Wealth Me Up" was deleted; the `grafana` Access app belongs to another service, leave it alone. The Zero Trust UI lives at `dash.cloudflare.com/<account>/one/…`.
- Google Cloud project `wealth-me-up-508615`: consent screen External/Testing (owner listed as test user), OAuth web client `wealth-me-up` with redirect URIs for production and `http://localhost:5173`.
- `deploy/.env` (Mac and pve1, mode 600) holds all six variables. `OWNER_EMAIL` is a leftover key from the Access era; nothing reads it.
- D1 on pve1 contains only the `selfhost-deployment-smoke-20260913` row from the previous smoke test; the owner has not saved a real portfolio yet.

**What changed (all on `main`)**

| Commits | Change |
| --- | --- |
| `c2b940b`..`2420f12` | In-app Google login: `lib/auth/` (signed cookies, PKCE, id_token claims, allowlist, safe `return_to`), `app/auth.ts`, routes under `app/auth/`, `/login` page, `app/page.tsx` as the sign-in gate rendering `app/dashboard.tsx`. `app/chatgpt-auth.ts` deleted; OpenAI Sites is no longer a target. `deploy/` rewritten (no Caddy, `.dev.vars` generated by `entrypoint.sh`, new wizard and smoke test). Spec and plan under `docs/superpowers/`. |
| `3aae7b4` | `deploy/Dockerfile` installs `ca-certificates`. Without it workerd rejects Google's TLS certificate and every login ends at `/login?error=failed`; Node's bundled CAs do not apply to workerd. |
| `6a4fff7` | Sample portfolio and demo chart removed; a new portfolio starts empty. `demoPortfolio` now lives only in `tests/portfolio.test.ts` as a fixture. |

**Verified at handoff**: `tests/portfolio.test.ts` 8/8, `tests/auth.test.ts` 10/10, `tsc --noEmit` clean, `npm run build` clean, `npm run lint` reports 3 pre-existing errors (two `set-state-in-effect` in `app/dashboard.tsx` / `app/portfolio-workspace.tsx`, one `no-html-link-for-pages` on the sidebar brand link) that predate this work.

**Decisions to keep**

- Owner key is the lowercased Google email (`app/auth.ts` → `userFromSession`). Do not switch to Google `sub` without a data migration.
- Framework `redirect()` emits 307; the smoke test accepts 302 or 307 for anonymous `/`.
- The denied-login log line includes the refused email on purpose (private server, main allowlist diagnostic). It never logs tokens.
- Session and OAuth-state cookies share `SESSION_SECRET`; rotating it signs everyone out and invalidates in-flight logins.

**Open items (none block use)**

- Adding a second user needs both `ALLOWED_EMAILS` and a Google test-user entry while the consent screen stays in Testing mode.
- Deferred review minors: `readAuthConfig` does not trim `SESSION_SECRET`; `decodeIdToken` lets a malformed JSON payload surface as a raw error (caught by the callback's try/catch); `entrypoint.sh` derives `--local-upstream` by stripping only the scheme from `APP_ORIGIN`; `app/page.tsx` does not catch `AUTH_NOT_CONFIGURED` (unreachable in production because compose refuses to start without the variables).
- The Mac has a git-ignored `.dev.vars` with dummy Google values for `npm run dev`; local login will fail until real values replace them.
- Cloudflared on pve1 warns that 2026.8.2 is outdated; harmless.
