# Google login for Wealth Me Up — design

Date: 2026-09-13. Status: approved by the owner in chat.

## Goal

Replace the ChatGPT-header identity contract (`app/chatgpt-auth.ts`, OpenAI Sites) and the Cloudflare Access gate on the self-hosted instance with an in-app **Google login**. Only emails on an allowlist may use the app. Everything in the app requires login. OpenAI Sites support is dropped.

## Decisions (from the owner)

- Google login is implemented **inside the app** (no Cloudflare Access, no Caddy).
- Access is **allowlist only** (`ALLOWED_EMAILS`), starting with the owner's email.
- The **whole app is gated**: an unauthenticated visitor is redirected to `/login`.
- Sessions are **stateless signed cookies**; no new D1 tables. Rotating `SESSION_SECRET` revokes every session.
- The portfolio owner key stays the **lowercased email**, so the existing pve1 data (keyed by the Access email) keeps working.

## Architecture

Approach: hand-rolled Authorization Code flow with PKCE against Google, verified in a route handler, then a signed session cookie checked by server code. No new npm dependencies; only Web Crypto and `fetch`, which exist in the Workers runtime and in Node 22 tests.

### Modules

| Unit | Responsibility | Depends on |
| --- | --- | --- |
| `lib/auth/config.ts` | Read env (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `ALLOWED_EMAILS`, `APP_ORIGIN`), parse/normalise the allowlist, `isAllowedEmail(email)`. Pure functions take the env object as a parameter so they are testable without `cloudflare:workers`. | none |
| `lib/auth/session.ts` | `signSession(payload, secret)` / `verifySession(token, secret, now)` for the session cookie and the short-lived OAuth state cookie. Format: `base64url(JSON).base64url(HMAC-SHA256)`. Constant-time compare. Rejects malformed, bad-signature, or expired tokens. | Web Crypto |
| `lib/auth/google.ts` | Build the Google authorization URL (PKCE S256, `openid email profile`, `prompt=select_account`), exchange the code at `https://oauth2.googleapis.com/token`, decode the `id_token` payload, and `validateIdTokenClaims(claims, {clientId, now})` (iss `https://accounts.google.com` or `accounts.google.com`, aud = client id, exp in future, `email_verified === true`, non-empty email). Signature verification is not needed because the token comes straight from Google over TLS with the client secret. `fetch` is injectable for tests. | Web Crypto, fetch |
| `lib/auth/return-path.ts` | `safeRelativeReturnPath(value)` ported from `chatgpt-auth.ts`; reserved paths are now `/login`, `/auth/*`. | none |
| `app/auth.ts` | Server helpers that use `next/headers`: `getUser()` (reads the `wmu_session` cookie, returns `{userId, email, displayName, fullName, picture}` or null), `requireUser(returnTo)` (redirects to `/login?return_to=…`). `userId` is `email.toLowerCase()`. | lib/auth, next/headers |
| `app/auth/google/login/route.ts` | GET: create state + PKCE verifier, set signed `wmu_oauth` cookie (10 min, HttpOnly, SameSite=Lax, Secure when APP_ORIGIN is https) holding `{state, verifier, returnTo}`, 302 to Google. | lib/auth |
| `app/auth/google/callback/route.ts` | GET: verify `state` against the cookie, exchange the code, validate claims, check allowlist. Success: set `wmu_session` (30 days), clear `wmu_oauth`, 302 to `returnTo`. Not allowed: clear cookies, 302 to `/login?error=not_allowed`. Any other failure: 302 to `/login?error=failed`. Never echo Google errors to the user. | lib/auth |
| `app/auth/logout/route.ts` | POST only (405 otherwise): clear `wmu_session`, 303 to `/login`. Reject if `Origin` header present and differs from request origin. | none |
| `app/login/page.tsx` | Server component. If already signed in, redirect to `/`. Otherwise Thai login page: brand, one button "เข้าสู่ระบบด้วย Google" linking to `/auth/google/login?return_to=…`, and an error message for `error=not_allowed` ("บัญชี Google นี้ไม่มีสิทธิ์ใช้งาน") or `error=failed` ("เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่"). Same green palette as the app. | app/auth |
| `app/page.tsx` | Becomes a server component: `const user = await requireUser("/")`, renders `<Dashboard user={…}/>`. | app/auth |
| `app/dashboard.tsx` | The existing client component from `app/page.tsx`, renamed. Receives `user` prop; sidebar footer shows the display name/email and a logout `<form method="post" action="/auth/logout">` button; the 401 fallback link points to `/login`. | unchanged deps |
| `app/api/portfolio/route.ts` | Imports `getUser` from `@/app/auth` instead of `getChatGPTUser`. No other change. | app/auth |

Delete `app/chatgpt-auth.ts`. In `vite.config.ts` pass `sites({ mockAuth: false })` so the dev server no longer injects ChatGPT headers (keep the plugin for its build step).

### Data flow

1. Visitor opens `/` → `requireUser` finds no valid cookie → 302 `/login?return_to=/`.
2. Login page → `/auth/google/login` → Google consent (account picker).
3. Google → `/auth/google/callback?code&state` → state check → token exchange → claim check → allowlist check → session cookie → 302 to `return_to`.
4. Dashboard loads `/api/portfolio`; the route reads the same cookie, uses `email.toLowerCase()` as `owner`.
5. Logout: POST `/auth/logout` clears the cookie.

### Cookies

- `wmu_session`: HttpOnly; Secure when `APP_ORIGIN` starts with `https`; SameSite=Lax; Path=/; Max-Age 30 days. Payload `{email, name, picture, iat, exp}`.
- `wmu_oauth`: same flags; Max-Age 600. Payload `{state, verifier, returnTo, exp}`.

### Environment

| Variable | Meaning |
| --- | --- |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth 2.0 Web client from Google Cloud Console. Authorized redirect URIs: `https://wealth-me-up.codex074.com/auth/google/callback` and `http://localhost:5173/auth/google/callback`. |
| `SESSION_SECRET` | ≥32 random bytes, base64/hex. `openssl rand -base64 32`. |
| `ALLOWED_EMAILS` | Comma-separated, case-insensitive, whitespace ignored. |
| `APP_ORIGIN` | Public origin, e.g. `https://wealth-me-up.codex074.com`; `http://localhost:5173` in dev. Used for the redirect URI and cookie `Secure` flag. |

Delivery to the Worker: Wrangler loads `.dev.vars` from the directory of the config file it is given. `deploy/entrypoint.sh` therefore writes `dist/server/.dev.vars` from the container environment (docker-compose `env_file: .env`) before starting `wrangler dev`. For local development a `.dev.vars` at the repo root is read by the Cloudflare Vite plugin; add `.dev.vars*` to `.gitignore` and `.dockerignore`. Extend `cloudflare-env.d.ts` with the string vars. Missing config must fail loudly (500 with a Thai message logged server-side), never silently allow.

### Deployment changes (`deploy/`)

- `docker-compose.yml`: drop the `proxy` service; `web` gets `env_file: .env`; `cloudflared` depends on `web`.
- Delete `Caddyfile`.
- `entrypoint.sh`: write `dist/server/.dev.vars` (mode 600) from `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `ALLOWED_EMAILS`, `APP_ORIGIN`; keep the migration marker and `--local-upstream` flags.
- `redeploy.sh`: require the five variables plus `TUNNEL_TOKEN` in `deploy/.env`; otherwise unchanged.
- `smoke-test.mjs`: target `http://wealth-me-up-web:8787`. Cases: `GET /` → 302 to `/login`; `GET /api/portfolio` anonymous → 401; spoofed `Oai-Authenticated-User-*` headers → still 401; forged `wmu_session` cookie → 401; `POST /auth/logout` with foreign Origin → 403; `GET /auth/google/callback` with no state → 302 to `/login?error=failed`.
- `setup-wizard.sh`: rewrite the stages: (1) Google Cloud Console — create OAuth consent screen (External, testing is fine) and a Web client with both redirect URIs, capture id/secret; (2) generate `SESSION_SECRET`, set `ALLOWED_EMAILS` (default = existing `OWNER_EMAIL`), set `APP_ORIGIN`; (3) Cloudflare — tunnel public hostname service URL becomes `http://wealth-me-up-web:8787`, disable *Protect with Access* on the route, delete the *Wealth Me Up* Access application; keep the existing `TUNNEL_TOKEN`; (4) deploy via `redeploy.sh`. Keep the wizard library section untouched.
- `deploy/.env` keeps `OWNER_EMAIL` for reference; `ALLOWED_EMAILS` is what the app reads.

### Docs

- `README.md`: "Run locally" describes `.dev.vars` and the Google client; "Product behavior" says sign-in is Google, allowlist only; the self-hosted section drops Access/Caddy and documents the new env, smoke test, and how to add a user or revoke sessions.
- `AGENTS.md`: identity handling now lives in `app/auth.ts` and `lib/auth/`; remove Sites/ChatGPT references and the `.openai/hosting.json` publishing guidance except the note that the plugin's build step still copies it.

## Error handling

- Missing env → `app/auth.ts` throws; route handlers catch and return 500 `{error:"ระบบยังไม่ได้ตั้งค่าการเข้าสู่ระบบ"}`; the login page shows the same message.
- Invalid/expired session cookie → treated as logged out; cookie cleared on next login attempt.
- Callback failures never leak Google error text; they log server-side and redirect with `error=failed`.
- `return_to` is always sanitised to a same-origin relative path that is not an auth path.

## Testing

`tests/auth.test.ts` with `node --experimental-strip-types --test`:

- session: round trip; tampered payload rejected; wrong secret rejected; expired rejected; malformed rejected.
- google: `validateIdTokenClaims` accepts a valid claim set and rejects wrong iss/aud, expired, unverified email, missing email; `buildAuthorizationUrl` includes PKCE challenge and state; `exchangeCode` with an injected fetch posts the expected form fields.
- config: allowlist parsing (spaces, case, empty entries); `isAllowedEmail`.
- return-path: same cases as the old chatgpt-auth behaviour plus `/login` and `/auth/...` being reserved.

Then `node node_modules/typescript/bin/tsc --noEmit`, `npm run build`, and a manual login on the deployed instance (owner email succeeds, another Google account sees "ไม่มีสิทธิ์").

## Out of scope

- Multi-user onboarding UI, profile pages, session listing.
- Google token refresh; the app never calls Google after login.
- Migrating any Sites-hosted data.
