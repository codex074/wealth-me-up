# wealth-me-up Cohere Visual Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin and re-compose every page of wealth-me-up (a Thai-language personal finance journal, Next-compatible Vinext on Vite/Cloudflare Workers) to Cohere's black/navy/coral/blue visual language, per the approved design spec — visual layer only, no accounting/data/auth behavior changes.

**Architecture:** Almost all visual change lands in `app/globals.css` (colors, font, radius, new `.hero-block`/`.dark-band`/`.rows` primitives). Each page's `.tsx` file gets a small JSX restructure to use those new classes in place of the old grid-of-cards markup. Financial gain/loss color stays green/red on light surfaces (the one carve-out from full Cohere adoption) and becomes white-line/blue-positive/coral-negative on the one dark band (TFEX).

**Tech Stack:** React 19 + Tailwind v4 (via `@import "tailwindcss"` in `globals.css`) + shadcn/radix primitives (`Dialog`, `Select`, `Tabs`, `Table`, `Sidebar`) + `recharts` (TFEX chart, already shipped). No new dependencies except a Google Fonts `@import` for `IBM Plex Sans` / `IBM Plex Sans Thai`.

**Spec:** `docs/superpowers/specs/2026-09-15-cohere-redesign-design.md`

## Global Constraints

- Preserve the Thai interface and all Thai copy verbatim — this is a visual-only redesign, never touch strings, routes, data shapes, or accounting logic.
- Font: `'IBM Plex Sans Thai', 'IBM Plex Sans', ui-sans-serif, system-ui` everywhere — one stack, not a Latin/Thai split by role (spec §2.2).
- Financial gain/loss on light (white) surfaces: green `#50854a` / red `#b30000` — never Action Blue/Coral (spec §1.5).
- Financial gain/loss on the navy TFEX dark band: white line, `#1863dc` (≥0) / `#ff7759` (<0) text — spec §1.6.
- Radius scale: `8px` small (chips/buttons pre-pill), `16px` cards/panels, `22px` hero/band containers, `9999px` primary CTA pills (spec §2.3).
- No `box-shadow` on page-level surfaces (flat + hairline border only) — spec §2.4.
- Keep the left sidebar (reskinned), never switch to a top-nav shell (spec §1.3, already decided against).
- Every task ends with: `node node_modules/typescript/bin/tsc --noEmit` clean, `npm run build` clean, and a manual browser check (dev server + synthetic session cookie, same technique already used earlier this session) comparing the rendered page against the approved mockup description for that decision.
- Commit after each task with a message describing only that task's page/scope.

---

## Task 1: Global design tokens and shared primitives (`app/globals.css`)

Foundational token + shared-primitive pass. No `.tsx` changes in this task — every subsequent task's page-specific work builds on this.

**Files:**
- Modify: `app/globals.css`

**Interfaces:**
- Produces: CSS custom properties `--ink-black`, `--navy`, `--action-blue`, `--coral`, `--soft-coral`, `--canvas-white`, `--soft-stone`, `--ink`, `--muted-slate`, `--slate`, `--hairline`, `--border-light`, `--focus-blue`, `--gain-green`, `--loss-red` (consumed by Tasks 2-7). Restyled shared classes `.btn`, `.btn.primary`, `.panel`, `.stat-card`, `.positive`, `.negative`, `.positive-pill`, `.positive-pill.light` (consumed by every later task — do not rename these classes in later tasks, only add new ones).

- [ ] **Step 1: Add the Google Fonts import**

In `app/globals.css`, the file currently opens with:
```css
@import "tailwindcss";
@import "tw-animate-css";
@import "../vendor/shadcn-tailwind-4.13.0.css";
```
Add a fourth `@import` line for the fonts (CSS requires `@import` rules to stay grouped at the top, so append it to this group, not elsewhere):
```css
@import "tailwindcss";
@import "tw-animate-css";
@import "../vendor/shadcn-tailwind-4.13.0.css";
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap');
```

- [ ] **Step 2: Replace the `:root` token block**

Find the existing `:root { ... }` block (starts `--background: #f7f8f5;`, ends before `@theme inline {`). Replace its entire contents with:
```css
:root {
  --background: #ffffff;
  --foreground: #212121;
  --card: #ffffff;
  --card-foreground: #17171c;
  --popover: #ffffff;
  --popover-foreground: #17171c;
  --primary: #17171c;
  --primary-foreground: #ffffff;
  --secondary: #eeece7;
  --secondary-foreground: #17171c;
  --muted: #f2f2f2;
  --muted-foreground: #75758a;
  --accent: #f2f2f2;
  --accent-foreground: #17171c;
  --destructive: #b30000;
  --border: #e5e7eb;
  --input: #e5e7eb;
  --ring: #4c6ee6;
  --chart-1: #f54900;
  --chart-2: #009689;
  --chart-3: #104e64;
  --chart-4: #ffb900;
  --chart-5: #fe9a00;
  --radius: 1rem;
  --sidebar: #17171c;
  --sidebar-foreground: #ffffff;
  --sidebar-primary: #ffffff;
  --sidebar-primary-foreground: #17171c;
  --sidebar-accent: #ffffff14;
  --sidebar-accent-foreground: #ffffff;
  --sidebar-border: #ffffff1a;
  --sidebar-ring: #4c6ee6;
  --ink-black: #17171c;
  --navy: #071829;
  --action-blue: #1863dc;
  --coral: #ff7759;
  --soft-coral: #ffad9b;
  --canvas-white: #ffffff;
  --soft-stone: #eeece7;
  --ink: #212121;
  --muted-slate: #93939f;
  --slate: #75758a;
  --hairline: #d9d9dd;
  --border-light: #e5e7eb;
  --focus-blue: #4c6ee6;
  --gain-green: #50854a;
  --loss-red: #b30000;
}
```
(`--chart-1..5` are untouched — they feed `components/ui/chart.tsx`, which is confirmed unused anywhere in this app, out of scope.)

- [ ] **Step 3: Update the font var in `@theme inline`**

In the same file, find:
```css
  --font-sans: "Noto Sans Thai", "Avenir Next", Arial, sans-serif;
```
Replace with:
```css
  --font-sans: "IBM Plex Sans Thai", "IBM Plex Sans", ui-sans-serif, system-ui;
```

- [ ] **Step 4: Update the base `body` rule, focus ring, button, panel, card, and financial-color primitives**

These all live inside the one long line-97 rule block. Make these exact substring replacements within it (each target string is unique in the file, so a scoped find-replace on just that substring is safe and won't disturb neighboring rules on the same line):

1. `body{background:var(--background);color:#263f34;font-family:"Noto Sans Thai","Avenir Next",Tahoma,Arial,sans-serif;font-size:16px;-webkit-font-smoothing:antialiased}`
   → `body{background:var(--background);color:var(--ink);font-family:"IBM Plex Sans Thai","IBM Plex Sans",ui-sans-serif,system-ui;font-size:16px;-webkit-font-smoothing:antialiased}`

2. `button:focus-visible,a:focus-visible{outline:3px solid #85a947;outline-offset:3px}`
   → `button:focus-visible,a:focus-visible{outline:3px solid var(--focus-blue);outline-offset:3px}`

3. `.btn{display:inline-flex;align-items:center;justify-content:center;gap:9px;padding:11px 17px;border:1px solid #dde3d5;background:white;border-radius:7px;font-size:13px;white-space:nowrap}.btn.primary{background:#285137;color:#fff;border-color:#285137;box-shadow:0 3px 5px #234c3312}.btn.primary:hover{background:#376848}`
   → `.btn{display:inline-flex;align-items:center;justify-content:center;gap:9px;padding:11px 20px;border:1px solid var(--border-light);background:#fff;border-radius:9999px;font-size:13px;font-weight:500;white-space:nowrap}.btn.primary{background:var(--ink-black);color:#fff;border-color:var(--ink-black);box-shadow:none}.btn.primary:hover{background:#000}`

4. `.panel{background:#fff;border:1px solid #e2e7db;border-radius:10px;overflow:hidden}`
   → `.panel{background:#fff;border:1px solid var(--border-light);border-radius:16px;overflow:hidden}`

5. `.stat-card{border:1px solid #e2e7db;border-radius:10px;padding:20px 19px;background:#fff;position:relative;overflow:hidden}`
   → `.stat-card{border:1px solid var(--border-light);border-radius:16px;padding:20px 19px;background:#fff;position:relative;overflow:hidden}`

6. `.positive{color:#50854a!important}.negative{color:#be6257!important}`
   → `.positive{color:var(--gain-green)!important}.negative{color:var(--loss-red)!important}`

7. `.positive-pill{background:#ffffff18;color:#d8edb1;border-radius:4px;font-size:10px;padding:4px 6px;display:inline-flex;align-items:center;gap:2px}.positive-pill.light{background:#eff5e8;color:#71925b}`
   → `.positive-pill{background:#ffffff18;color:#fff;border-radius:9999px;font-size:10px;padding:4px 8px;display:inline-flex;align-items:center;gap:2px}.positive-pill.light{background:#eefcf5;color:var(--gain-green)}`

- [ ] **Step 5: Verify**

Run:
```bash
node node_modules/typescript/bin/tsc --noEmit
npm run build
```
Both must be clean (this task touches no `.ts`/`.tsx`, so this mainly guards against a CSS syntax typo breaking the Vite build).

- [ ] **Step 6: Manual visual check**

Start the dev server and open the app in a signed-in session (see "Browser verification technique" below). Confirm on any page: body text renders in the new font (visibly different letterforms from the old Noto Sans Thai — check a Thai heading and a number side by side), every `.btn.primary` (e.g. "+ บันทึกรายการ") is a black pill with no shadow, positive/negative numbers anywhere (e.g. Overview's "กำไร / ขาดทุน TFEX" card) are still green/red but the red is now the flatter `#b30000` instead of the old dusty `#be6257`. Take one full-page screenshot of the Overview page for later comparison.

**Browser verification technique** (reuse across every task in this plan): the local dev DB has no real Google OAuth locally. Use the synthetic-session-cookie technique already used twice this session: sign a token with `lib/auth/session.ts`'s `signToken({email:"owner@example.com",name:"Owner",picture:null,iat:Date.now(),exp:Date.now()+2592000000}, "dev-only-secret-change-me-0123456789")` (the `SESSION_SECRET` in the repo's own `.dev.vars`), set it as the `wmu_session` cookie via the browser tool's `javascript_tool` (`document.cookie = "wmu_session=<token>; path=/"`), then navigate normally. Never touch `app/page.tsx`'s `requireUser` call itself to bypass auth (that was already tried once this session and rightly blocked by the safety classifier as security-weakening) — the cookie route is the correct one.

- [ ] **Step 7: Commit**

```bash
git add app/globals.css
git commit -m "Redesign: Cohere color/font/radius tokens and shared primitives"
```

---

## Task 2: Sidebar shell recolor (`app/globals.css`, no `.tsx` change)

**Files:**
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `--ink-black`, `--action-blue`, `--focus-blue` from Task 1.
- Produces: nothing new consumed by later tasks (this task is visually self-contained — the sidebar markup itself in `app/dashboard.tsx` is untouched, only its CSS).

- [ ] **Step 1: Recolor the sidebar rules**

All of these live in the same line-97 block as Task 1's edits. Exact substring replacements:

1. `.wealth-sidebar [data-slot=sidebar-inner]{background:#fbfcf9;border-right:1px solid #e3e7dd}`
   → `.wealth-sidebar [data-slot=sidebar-inner]{background:var(--ink-black);border-right:1px solid #ffffff14}`

2. `.brand{display:flex;gap:11px;align-items:center;font-size:21px;letter-spacing:-.8px;font-weight:750;color:#224b34}`
   → `.brand{display:flex;gap:11px;align-items:center;font-size:21px;letter-spacing:-.8px;font-weight:600;color:#fff}`

3. `.brand-icon{background:#244d36;border-radius:10px;width:37px;height:39px;color:#dfedb0;display:grid;place-items:center}`
   → `.brand-icon{background:#fff;border-radius:10px;width:37px;height:39px;color:var(--ink-black);display:grid;place-items:center}`

4. `.brand small{display:block;font-size:8px;letter-spacing:1.6px;margin-top:4px;color:#6b7f6c}`
   → `.brand small{display:block;font-size:8px;letter-spacing:1.6px;margin-top:4px;color:#8a8a94}`

5. `.workspace-tag{border:1px solid #e1e6db;border-radius:9px;display:flex;align-items:center;gap:10px;padding:12px 10px;margin-bottom:26px;font-size:14px}`
   → `.workspace-tag{border:1px solid #ffffff1a;border-radius:9px;display:flex;align-items:center;gap:10px;padding:12px 10px;margin-bottom:26px;font-size:14px;color:#fff}`

6. `.workspace-tag>svg{margin-left:auto;color:#8b9788}.workspace-tag small{display:block;font-size:11px;color:#8a9288;margin-top:2px}`
   → `.workspace-tag>svg{margin-left:auto;color:#8a8a94}.workspace-tag small{display:block;font-size:11px;color:#8a8a94;margin-top:2px}`

7. `.workspace-avatar{width:31px;height:34px;background:#e9eedd;color:#597547;border-radius:6px;display:grid;place-items:center;font-size:15px}`
   → `.workspace-avatar{width:31px;height:34px;background:#ffffff1a;color:#fff;border-radius:6px;display:grid;place-items:center;font-size:15px}`

8. `.nav-label{font-size:10px;letter-spacing:1.5px;color:#9aA294;padding:0 14px 10px}`
   → `.nav-label{font-size:10px;letter-spacing:1.5px;color:#6d6d78;padding:0 14px 10px}`

9. `.nav-button{height:46px!important;border-radius:7px!important;padding:0 14px!important;color:#697366;font-size:14px!important;gap:12px!important;margin:3px 0}.nav-button[data-active=true]{background:#e9efdf!important;color:#315531!important;font-weight:600!important}.nav-button[data-active=true]:before{content:"";position:absolute;left:-16px;height:25px;width:3px;border-radius:0 4px 4px 0;background:#63874b}`
   → `.nav-button{height:46px!important;border-radius:7px!important;padding:0 14px!important;color:#a5a5b0;font-size:14px!important;gap:12px!important;margin:3px 0}.nav-button[data-active=true]{background:#ffffff14!important;color:#fff!important;font-weight:600!important}.nav-button[data-active=true]:before{content:"";position:absolute;left:-16px;height:25px;width:3px;border-radius:0 4px 4px 0;background:var(--action-blue)}`

10. `.new-badge{font-size:9px;margin-left:auto;background:#e7ecdf;border:1px solid #d6dfca;padding:2px 4px;border-radius:4px;color:#6f825e}`
    → `.new-badge{font-size:9px;margin-left:auto;background:#ffffff14;border:1px solid #ffffff1a;padding:2px 4px;border-radius:4px;color:#c7c7cf}`

11. `.growth-note{background:#f0f3e9;border:1px solid #e4e9da;border-radius:10px;padding:20px 15px;color:#577346;margin-bottom:17px}.growth-note>svg{margin-bottom:15px}.growth-note strong{display:block;font-size:13px}.growth-note p{font-size:12px;line-height:1.9;color:#89917e;margin-top:6px}.note-line{height:3px;width:45px;background:#cad8ae;margin-top:18px}`
    → `.growth-note{background:#ffffff0d;border:1px solid #ffffff1a;border-radius:10px;padding:20px 15px;color:#fff;margin-bottom:17px}.growth-note>svg{margin-bottom:15px}.growth-note strong{display:block;font-size:13px}.growth-note p{font-size:12px;line-height:1.9;color:#a5a5b0;margin-top:6px}.note-line{height:3px;width:45px;background:var(--action-blue);margin-top:18px}`

12. `.profile{display:flex;gap:11px;align-items:center;padding:16px 3px 3px;border-top:1px solid #e3e8dd;font-size:13px}.profile small{display:flex;gap:4px;align-items:center;margin-top:4px;color:#8b9787;font-size:11px}.profile-avatar{width:35px;height:35px;display:grid;place-items:center;border-radius:50%;background:#e7ebde;color:#6f825a;font-size:14px}`
    → `.profile{display:flex;gap:11px;align-items:center;padding:16px 3px 3px;border-top:1px solid #ffffff1a;font-size:13px;color:#fff}.profile small{display:flex;gap:4px;align-items:center;margin-top:4px;color:#a5a5b0;font-size:11px}.profile-avatar{width:35px;height:35px;display:grid;place-items:center;border-radius:50%;background:#ffffff1a;color:#fff;font-size:14px}`

Also, near the end of the file (line 103), find:
```
.wealth-sidebar [data-slot=sidebar-inner]{border-right-color:#e3e7dd}.wealth-sidebar{border-right-color:#e3e7dd!important}
```
Replace with:
```
.wealth-sidebar [data-slot=sidebar-inner]{border-right-color:#ffffff14}.wealth-sidebar{border-right-color:#ffffff14!important}
```

- [ ] **Step 2: Verify**

```bash
node node_modules/typescript/bin/tsc --noEmit
npm run build
```

- [ ] **Step 3: Manual visual check**

Sidebar should now be solid near-black with white "wealth me up" wordmark (white icon chip), white/gray nav items, the active nav item highlighted with a subtle white-tinted background and an **action-blue** left accent bar (not the old green one), and the "ความมั่งคั่ง เริ่มจากการบันทึก" note card rendering as a translucent-white card on the black sidebar. Check both desktop width and the mobile hamburger-triggered sidebar sheet (resize or use a fresh narrow tab per this session's earlier mobile-check technique).

- [ ] **Step 4: Commit**

```bash
git add app/globals.css
git commit -m "Redesign: recolor sidebar shell to Cohere black"
```

---

## Task 3: Login page — hero pattern (`app/login/page.tsx`, `app/globals.css`)

Introduces the reusable `.hero-block` primitive that Tasks 4 and 5 (Overview, TFEX) will also use.

**Files:**
- Modify: `app/login/page.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Produces: `.hero-block`, `.hero-block .eyebrow`, `.hero-block .hero-num` CSS classes — Tasks 4 and 5 reuse these exact class names on their own hero numbers. Do not rename them.

- [ ] **Step 1: Add the `.hero-block` primitive and restyle the login card**

In `app/globals.css`, find:
```
.login-shell{min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 20% 10%,#eef3e4,transparent 55%),var(--background)}
.login-card{width:100%;max-width:420px;background:#fff;border:1px solid #e2e7db;border-radius:14px;padding:38px 34px;display:flex;flex-direction:column;gap:14px;box-shadow:0 12px 40px #24493318}
.login-google{margin-top:12px;padding:13px 18px;font-size:15px}
.login-note{display:flex;align-items:center;gap:5px;color:#9aa38f;font-size:12px}
```
Replace the whole block with:
```
.login-shell{min-height:100vh;display:grid;place-items:center;padding:24px;background:var(--canvas-white)}
.login-card{width:100%;max-width:440px;background:#fff;border:1px solid var(--border-light);border-radius:22px;padding:44px 38px;display:flex;flex-direction:column;gap:14px;box-shadow:none}
.login-google{margin-top:16px;padding:14px 18px;font-size:15px}
.login-note{display:flex;align-items:center;gap:5px;color:var(--muted-slate);font-size:12px}
.hero-block{margin-bottom:4px}
.hero-block .eyebrow{font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:var(--action-blue);font-weight:600;margin-bottom:10px}
.hero-block .hero-num{font-size:40px;font-weight:400;letter-spacing:-1px;line-height:1;color:var(--ink-black)}
```
(The login hero number is smaller than Overview/TFEX's 64px per spec §2.2 because it holds the brand wordmark, not a money figure, inside a 440px-wide card — 64px would wrap awkwardly at that width. Overview/TFEX get the full 64px in their own tasks via a page-level override, not by changing this shared rule.)

- [ ] **Step 2: Restructure the login JSX**

In `app/login/page.tsx`, find:
```tsx
 return <main className="login-shell">
  <section className="login-card">
   <div className="brand"><span className="brand-icon"><ChartNoAxesCombined size={25}/></span><span>wealth<span className="brand-light"> me up</span><small>MAKE YOUR WEALTH GROW</small></span></div>
   <h1>เข้าสู่ระบบ</h1>
   <p>บันทึกการลงทุน บัญชีเงินสด และผลเทรด TFEX ของคุณในที่เดียว</p>
   {message&&<div className="error-message" role="alert">{message}</div>}
   <a className="btn primary login-google" href={`/auth/google/login?return_to=${encodeURIComponent(returnTo)}`}><GoogleMark/> เข้าสู่ระบบด้วย Google</a>
   <small className="login-note"><ShieldCheck size={13}/> เฉพาะบัญชีที่ได้รับอนุญาตเท่านั้น</small>
  </section>
 </main>;
```
Replace with:
```tsx
 return <main className="login-shell">
  <section className="login-card">
   <div className="hero-block">
    <div className="eyebrow">YOUR WEALTH, IN ONE PLACE</div>
    <div className="hero-num">wealth me up</div>
   </div>
   <p>บันทึกการลงทุน บัญชีเงินสด และผลเทรด TFEX ของคุณในที่เดียว</p>
   {message&&<div className="error-message" role="alert">{message}</div>}
   <a className="btn primary login-google" href={`/auth/google/login?return_to=${encodeURIComponent(returnTo)}`}><GoogleMark/> เข้าสู่ระบบด้วย Google</a>
   <small className="login-note"><ShieldCheck size={13}/> เฉพาะบัญชีที่ได้รับอนุญาตเท่านั้น</small>
  </section>
 </main>;
```
Note `ChartNoAxesCombined` is now unused in this file (the icon chip is dropped in favor of the plain wordmark, matching the approved login mockup) — remove it from the import line at the top of the file:
```tsx
import {ChartNoAxesCombined,ShieldCheck} from "lucide-react";
```
→
```tsx
import {ShieldCheck} from "lucide-react";
```

- [ ] **Step 3: Verify**

```bash
node node_modules/typescript/bin/tsc --noEmit
npm run build
```

- [ ] **Step 4: Manual visual check**

Sign out (or use a fresh incognito-equivalent tab with no `wmu_session` cookie) and load `/login`. Confirm: plain white background (no green radial gradient), a rounded 22px white card with a blue uppercase eyebrow, "wealth me up" as a large tight-letter-spaced headline (no icon chip), the Google button as a black pill. Compare against the approved login-page description in the spec (§5, first bullet).

- [ ] **Step 5: Commit**

```bash
git add app/login/page.tsx app/globals.css
git commit -m "Redesign: login page hero pattern"
```

---

## Task 4: Overview page — hero, stat cards, donut (`app/dashboard.tsx`, `app/globals.css`)

**Files:**
- Modify: `app/dashboard.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `.hero-block`/`.eyebrow`/`.hero-num` from Task 3 (this task adds a page-level override for the 64px size, see Step 1).
- Produces: nothing new consumed elsewhere — Overview's featured-stat-card and donut colors are Overview-specific.

- [ ] **Step 1: Add the Overview hero-size override and recolor stat cards/donut**

In `app/globals.css`, add this new rule (anywhere after the `.hero-block` rules from Task 3 — append it right after them):
```css
.hero-block.hero-lg .hero-num{font-size:64px;letter-spacing:-2px}
```
`.hero-lg` is an explicit modifier class Step 2 below adds to the Overview hero's JSX (and Task 5 adds the same 64px size directly under `.tfex-band .hero-num`, since that one is already uniquely scoped by its parent) — deliberately not a sibling-combinator selector keyed off page position, since `app/dashboard.tsx`'s actual DOM has a `.toolbar` div between `.page-heading` and the Overview content block, which would break a `.page-heading + .hero-block` adjacency selector. This leaves the login card's smaller 40px hero (Task 3, no `.hero-lg` class) untouched.

Then make these exact substring replacements in the line-97 block:

1. `.stat-card.featured{background:#254b35;color:#fff;border-color:#254b35}.featured .stat-label{color:#d1dbc9}.featured .stat-value{position:relative;z-index:1}.featured .stat-bottom{color:#c6d6bf}`
   → `.stat-card.featured{background:var(--ink-black);color:#fff;border-color:var(--ink-black)}.featured .stat-label{color:#a5a5b0}.featured .stat-value{position:relative;z-index:1}.featured .stat-bottom{color:#c7c7cf}`

2. `.featured-decoration{position:absolute;right:-20px;bottom:-50px;width:140px;height:140px;border:1px solid #ffffff0d;border-radius:50%;box-shadow:0 0 0 20px #ffffff03,0 0 0 40px #ffffff03;pointer-events:none}`
   — leave unchanged (already white-on-dark, works on `--ink-black` same as it did on the old dark green).

3. `.account-dots i{border:2px solid #fff;background:#46966a;color:#fff;width:21px;height:21px;border-radius:50%;margin-right:-5px;display:grid;place-items:center;font-style:normal;font-size:8px}.account-dots i:nth-child(2){background:#826397}.account-dots i:nth-child(3){background:#d6df87;color:#506042}`
   → `.account-dots i{border:2px solid #fff;background:var(--ink-black);color:#fff;width:21px;height:21px;border-radius:50%;margin-right:-5px;display:grid;place-items:center;font-style:normal;font-size:8px}.account-dots i:nth-child(2){background:var(--action-blue)}.account-dots i:nth-child(3){background:var(--coral);color:#fff}`

4. `.stat-icon{color:#9ba58e;border-radius:6px;background:#f6f8f2;padding:5px}`
   → `.stat-icon{color:var(--slate);border-radius:6px;background:var(--soft-stone);padding:5px}`

5. `.donut-hole span{font-size:10px;color:#949d88}` → `.donut-hole span{font-size:10px;color:var(--muted-slate)}`
   `.donut-hole small{font-size:11px;font-weight:400;color:#7f8b73}` → `.donut-hole small{font-size:11px;font-weight:400;color:var(--slate)}`
   `.donut{width:170px;height:170px;margin:23px auto 20px;border-radius:50%;background:conic-gradient(#28523b 0 42.6%,white 42.6% 43.3%,#92ad79 43.3% 68.4%,white 68.4% 69.1%,#d5ddaf 69.1% 80.7%,white 80.7% 81.4%,#eaece2 81.4% 99.3%,white 99.3%);display:grid;place-items:center;transform:rotate(-85deg)}` — leave the `conic-gradient` stops here as-is; the actual colors come from `allocation.map` in `dashboard.tsx` (Step 2), which builds the gradient from a JS color array, not this CSS default.

6. `.allocation-legend span{display:flex;align-items:center;gap:6px;color:#7e8a75}` → `.allocation-legend span{display:flex;align-items:center;gap:6px;color:var(--slate)}`

- [ ] **Step 2: Restructure the Overview hero and recolor the donut's color array**

In `app/dashboard.tsx`, find the `.stats-grid` opening (the "มูลค่าทรัพย์สินทั้งหมด" featured card is the first child of `.stats-grid`):
```tsx
 {page==="overview"&&<><div className="stats-grid"><section className="stat-card featured"><div className="stat-label">มูลค่าทรัพย์สินทั้งหมด <button aria-label="ซ่อนหรือแสดงมูลค่า" onClick={()=>setHidden(!hidden)}><Eye size={17}/></button></div><div className="stat-value">{money(summary.total)}</div><div className="stat-bottom"><span className="positive-pill">{summary.gain>=0?<ArrowUpRight size={14}/>:<ArrowDownLeft size={14}/>} {summary.cost?(summary.gain/summary.cost*100).toFixed(2):"0.00"}%</span><span>{signed(summary.gain)} จากต้นทุน</span></div><div className="featured-decoration"/></section>
```
Replace with (adds a `.hero-block` above the existing stats grid; the featured card's OWN big number stays as a secondary confirmation, matching how the approved mockup kept "Your wealth, in one place" as the true hero and the black featured card as a supporting element, not a duplicate of it — so also **drop** the featured-card treatment on this first card and demote it to a plain `.stat-card`, since the hero above it now carries that role):
```tsx
 {page==="overview"&&<><div className="hero-block hero-lg"><div className="eyebrow">YOUR WEALTH, IN ONE PLACE</div><div className="hero-num">{money(summary.total)}</div><p className="help-text" style={{marginTop:10}}>มูลค่าประเมินล่าสุด · {signed(summary.gain)} จากต้นทุน</p></div><div className="stats-grid"><section className="stat-card"><div className="stat-label">มูลค่าทรัพย์สินทั้งหมด <button aria-label="ซ่อนหรือแสดงมูลค่า" onClick={()=>setHidden(!hidden)}><Eye size={17}/></button></div><div className="stat-value">{money(summary.total)}</div><div className="stat-bottom"><span className="positive-pill light">{summary.gain>=0?<ArrowUpRight size={14}/>:<ArrowDownLeft size={14}/>} {summary.cost?(summary.gain/summary.cost*100).toFixed(2):"0.00"}%</span><span>{signed(summary.gain)} จากต้นทุน</span></div></section>
```
(`.stat-card.featured` class and the `<div className="featured-decoration"/>` are removed from this card; the remaining 3 cards in `.stats-grid` — "มูลค่าสินทรัพย์ลงทุน", "เงินสดคงเหลือ", "กำไร/ขาดทุน TFEX" — are unchanged by this task, they just render with the new plain `.stat-card` styling from Task 1.)

Now find the donut color array:
```tsx
 const allocation=[...new Set(assets.map(a=>a.type)),"เงินสด"].map((type,i)=>({type,value:type==="เงินสด"?summary.cash:assets.filter(a=>a.type===type).reduce((v,a)=>v+a.value*(a.currency==="USD"?data.fx:1),0),color:["#28523b","#92ad79","#d5ddaf","#eaece2","#b8c9ad"][i%5]})).filter(a=>a.value>0);
```
Replace the color array with a navy/coral/blue/stone set:
```tsx
 const allocation=[...new Set(assets.map(a=>a.type)),"เงินสด"].map((type,i)=>({type,value:type==="เงินสด"?summary.cash:assets.filter(a=>a.type===type).reduce((v,a)=>v+a.value*(a.currency==="USD"?data.fx:1),0),color:["#071829","#1863dc","#ff7759","#eeece7","#93939f"][i%5]})).filter(a=>a.value>0);
```

Also recolor the `assets.map` logo-color array a few lines above it:
```tsx
 const assets=summary.assets.map((a,i)=>({...a,platformId:a.platform,platform:data.platforms.find(p=>p.id===a.platform)?.name??"—",color:["#263d31","#77a23c","#84a544","#29966b"][i%4]}));
```
→
```tsx
 const assets=summary.assets.map((a,i)=>({...a,platformId:a.platform,platform:data.platforms.find(p=>p.id===a.platform)?.name??"—",color:["#17171c","#1863dc","#ff7759","#93939f"][i%4]}));
```

- [ ] **Step 3: Verify**

```bash
node node_modules/typescript/bin/tsc --noEmit
npm run build
```

- [ ] **Step 4: Manual visual check**

Load the Overview page signed in. Confirm: a large "YOUR WEALTH, IN ONE PLACE" eyebrow + 64px total-wealth headline sits above the 4-card stat grid; the first stat card is no longer a dark-green "featured" block (now a plain white card like the other three); the "สัดส่วนสินทรัพย์" donut and asset-identity logo circles use the new navy/coral/blue palette instead of the old greens. Check the `setHidden` eye-toggle still masks amounts correctly (unchanged logic, just confirms the restructure didn't break the button's `onClick`).

- [ ] **Step 5: Commit**

```bash
git add app/dashboard.tsx app/globals.css
git commit -m "Redesign: Overview page hero and stat-card/donut recolor"
```

---

## Task 5: TFEX page — dark band, chart colors, hero (`app/portfolio-workspace.tsx`, `app/globals.css`)

**Files:**
- Modify: `app/portfolio-workspace.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `.hero-block` (Task 3) as the base pattern — this task defines its own `.tfex-band .hero-num{font-size:64px...}` sizing directly (Step 1 below) rather than sharing Task 4's `.hero-lg` modifier, since `.tfex-band` already uniquely scopes it.
- Consumes: `TfexPnlChart`/`TfexTooltip` (already shipped this session in `app/portfolio-workspace.tsx`) — this task changes their hard-coded colors only, not their data logic (`tfexPnlSeries`/`availableTfexPeriods` in `lib/portfolio.ts` are untouched).

- [ ] **Step 1: Add the `.tfex-band` dark-band primitive**

In `app/globals.css`, add this new rule block (append after the rule added in Task 4):
```css
.tfex-band{background:var(--navy);color:#fff;border-radius:22px;padding:32px 28px;margin-bottom:22px}
.tfex-band .eyebrow{font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#7fa8d9;font-weight:600;margin-bottom:10px}
.tfex-band .hero-sub{font-size:13px;color:#93a8c2;margin-top:8px}
.tfex-band .band-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:24px}
.tfex-band .band-item{background:#ffffff0d;border:1px solid #ffffff1a;border-radius:16px;padding:16px}
.tfex-band .band-item .k{font-size:11px;color:#93a8c2;margin-bottom:8px}
.tfex-band .band-item .v{font-size:22px;font-weight:500;letter-spacing:-.3px;color:#fff}
.tfex-band .hero-num{color:#fff;font-size:64px;letter-spacing:-2px}
.dark-positive{color:var(--action-blue)!important}
.dark-negative{color:var(--coral)!important}
.tfex-band .chart-summary,.tfex-band .chart-summary small{color:#fff}
.tfex-band .chart-legend{color:#93a8c2}
.tfex-band .legend-line{background:#fff}
.tfex-band .legend-line.dashed{border-top-color:#ffffff55}
.tfex-band .empty-state{color:#93a8c2}
@media(max-width:767px){.tfex-band .band-grid{grid-template-columns:1fr}}
```

- [ ] **Step 2: Restructure the TFEX branch's stat-card trio into the dark band**

In `app/portfolio-workspace.tsx`, find the start of the `page==="tfex"` branch:
```tsx
 if(page==="tfex")return <><div className="tfex-metrics"><section className="stat-card"><div className="stat-label">กำไร / ขาดทุนสุทธิที่ปิดแล้ว</div><div className={`stat-value ${s.pnl>=0?"positive":"negative"}`}>{money(s.pnl)}</div><p className="help-text">หักค่าธรรมเนียมรวมแล้ว</p></section><section className="stat-card"><div className="stat-label">Win rate</div><div className="stat-value">{s.winRate.toFixed(1)}%</div><p className="help-text">ชนะ {data.tfex.filter(t=>(tfexPnl(t)??0)>0).length} จาก {s.closed} เทรดที่ปิด</p></section><section className="stat-card"><div className="stat-label">สถานะเปิดอยู่</div><div className="stat-value">{data.tfex.filter(t=>t.exit===null).length} <small>เทรด</small></div><p className="help-text">แก้ไขเทรดเพื่อบันทึกราคาปิด</p></section></div><p className="help-text mb-4">สมุดบันทึก Futures แยกจากยอดบัญชีเงินสด · กำไร TFEX ไม่ถูกนำมาบวกซ้ำในมูลค่าพอร์ต · มูลค่าต่อจุดกำหนดเองตามสัญญา</p><TfexPnlChart data={data} money={money}/>{!data.tfex.length?<Empty title="ทุกเทรดมีสิ่งให้เรียนรู้"
```
Replace with (folds the 3 stat cards into the navy band as a hero number + 2-stat grid, matching the approved dark-band mockup, and moves `TfexPnlChart` inside the same band so it inherits the white/coral chart styling from Step 3 below):
```tsx
 if(page==="tfex")return <><div className="tfex-band"><div className="eyebrow">TFEX PERFORMANCE</div><div className={`hero-num ${s.pnl>=0?"dark-positive":"dark-negative"}`}>{money(s.pnl)}</div><p className="hero-sub">กำไร/ขาดทุนสุทธิที่ปิดแล้ว หักค่าธรรมเนียมรวมแล้ว</p><div className="band-grid"><div className="band-item"><div className="k">Win rate</div><div className="v">{s.winRate.toFixed(1)}%</div></div><div className="band-item"><div className="k">เทรดที่ปิดแล้ว</div><div className="v">{s.closed}</div></div><div className="band-item"><div className="k">สถานะเปิดอยู่</div><div className="v">{data.tfex.filter(t=>t.exit===null).length}</div></div></div><TfexPnlChart data={data} money={money}/></div><p className="help-text mb-4">สมุดบันทึก Futures แยกจากยอดบัญชีเงินสด · กำไร TFEX ไม่ถูกนำมาบวกซ้ำในมูลค่าพอร์ต · มูลค่าต่อจุดกำหนดเองตามสัญญา</p>{!data.tfex.length?<Empty title="ทุกเทรดมีสิ่งให้เรียนรู้"
```
Note the win-rate card's old caption ("ชนะ N จาก M เทรดที่ปิด") is dropped in favor of a plain "เทรดที่ปิดแล้ว" count card — the "N wins out of M" detail is still fully visible in the trades table below (every row shows its own P&L sign), so no information is lost, just moved from a caption into the existing table.

- [ ] **Step 3: Remove `TfexPnlChart`'s own `<section className="panel performance...">` wrapper (it now lives inside `.tfex-band`) and recolor its chart**

`TfexPnlChart` currently renders its own `<section className="panel performance mb-6">...</section>` wrapper with a `.panel-heading` and its own `.chart-summary`/`.chart-wrap`/`.chart-legend`. Since Step 2 now nests it inside `.tfex-band` (which is itself the dark rounded container), find the component's outer wrapper:
```tsx
 return <section className="panel performance mb-6">
  <div className="panel-heading">
```
Replace with:
```tsx
 return <div className="mt-2">
  <div className="panel-heading" style={{padding:0}}>
```
And find its closing tag:
```tsx
 </section>;
}
```
(the one that closes `TfexPnlChart`'s return, not `DataViews`'s) — replace with:
```tsx
 </div>;
}
```

Now recolor the chart itself. Find:
```tsx
   <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><LineChart data={series} margin={{top:5,right:10,left:0,bottom:0}}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef1e9"/><XAxis dataKey="date" tickFormatter={tick} tick={{fontSize:10,fill:"#9ba38f"}} axisLine={false} tickLine={false} minTickGap={24} interval="preserveStartEnd"/><YAxis hide/><ReferenceLine y={0} stroke="#b8c6b4" strokeDasharray="4 4"/><Tooltip content={<TfexTooltip money={money}/>}/><Line type="monotone" dataKey="cumulative" stroke="#50774a" strokeWidth={2} dot={false} activeDot={{r:4}} isAnimationActive={false}/></LineChart></ResponsiveContainer></div>
```
Replace with (`CartesianGrid`/`XAxis` tick/`ReferenceLine` colors become light-on-navy; the `Line` stroke becomes white per spec §1.6):
```tsx
   <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><LineChart data={series} margin={{top:5,right:10,left:0,bottom:0}}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff14"/><XAxis dataKey="date" tickFormatter={tick} tick={{fontSize:10,fill:"#93a8c2"}} axisLine={false} tickLine={false} minTickGap={24} interval="preserveStartEnd"/><YAxis hide/><ReferenceLine y={0} stroke="#ffffff55" strokeDasharray="4 4"/><Tooltip content={<TfexTooltip money={money}/>}/><Line type="monotone" dataKey="cumulative" stroke="#ffffff" strokeWidth={2} dot={false} activeDot={{r:4}} isAnimationActive={false}/></LineChart></ResponsiveContainer></div>
```

Find the headline that colors by sign:
```tsx
   <div className="chart-summary">{money(last.cumulative)} <span className={last.cumulative>=0?"positive":"negative"}>{scopeLabel}</span></div>
```
Replace with (per spec §1.6, positive→action-blue text, negative→coral, applied to the number itself via the same `dark-positive`/`dark-negative` classes just introduced in Step 1/2 — not inline style, to stay consistent with how the rest of this codebase toggles financial sign color via className, e.g. the existing `.positive`/`.negative` pattern; the label stays a neutral muted tone since it's not itself the signed value):
```tsx
   <div className={`chart-summary ${last.cumulative>=0?"dark-positive":"dark-negative"}`}>{money(last.cumulative)} <span className="chart-caption-muted">{scopeLabel}</span></div>
```
Also add one more line to `app/globals.css`'s `.tfex-band` rules (right where the other `.tfex-band .chart-summary` rules from Step 1 are): `.tfex-band .chart-caption-muted{color:#93a8c2}`.

And update `TfexTooltip` itself. Find:
```tsx
function TfexTooltip({active,payload,label,money}:Partial<TooltipContentProps<number,string>>&{money:(n:number)=>string}){
 if(!active||!payload?.length)return null;
 const v=Number(payload[0].value),d=String(label);
 return <div className="rounded-md border border-[#e2e7db] bg-white px-3 py-2 text-xs shadow-sm">
  <strong className={v>=0?"positive":"negative"}>{v>=0?"+":"−"}{money(Math.abs(v))}</strong>
  <div className="mt-1 text-[#9ba38f]">{Number(d.slice(8,10))} {thMonths[Number(d.slice(5,7))-1]} {d.slice(0,4)}</div>
 </div>;
}
```
Replace with:
```tsx
function TfexTooltip({active,payload,label,money}:Partial<TooltipContentProps<number,string>>&{money:(n:number)=>string}){
 if(!active||!payload?.length)return null;
 const v=Number(payload[0].value),d=String(label);
 return <div className="rounded-md border border-[#ffffff33] bg-[#0d2338] px-3 py-2 text-xs shadow-sm">
  <strong className={v>=0?"dark-positive":"dark-negative"}>{v>=0?"+":"−"}{money(Math.abs(v))}</strong>
  <div className="mt-1 text-[#93a8c2]">{Number(d.slice(8,10))} {thMonths[Number(d.slice(5,7))-1]} {d.slice(0,4)}</div>
 </div>;
}
```
(`dark-positive`/`dark-negative` are the same two global classes added to `app/globals.css` earlier in this step — they carry `!important`, so they render correctly even though `<strong>` has no other color rule competing here.)

- [ ] **Step 4: Verify**

```bash
node node_modules/typescript/bin/tsc --noEmit
npm run build
```

- [ ] **Step 5: Manual visual check**

Load the TFEX page signed in (against the local dev DB's existing 54-closed-trade synthetic data, same dataset used earlier this session). Confirm: the whole "กำไร/ขาดทุนสุทธิ" + "Win rate" + "เทรดที่ปิดแล้ว" + "สถานะเปิดอยู่" + the cumulative-P&L chart all sit inside one rounded navy card; the chart line is white, the headline number is coral (since this dataset is net-negative, `-฿32,432.56`) with the "สะสมทั้งหมด" label in a muted blue-gray; hovering shows a dark tooltip with the same coral/blue sign convention; switching the mode Tabs (ทั้งหมด/รายปี/ไตรมาส) and the period `Select` still works exactly as before (unchanged logic — only confirms the restyle didn't break interaction); the trades table below the band is unaffected (still the old light styling, to be addressed in Task 6). Check mobile width too — the band's `.band-grid` should collapse to 1 column per the media query added in Step 1.

- [ ] **Step 6: Commit**

```bash
git add app/portfolio-workspace.tsx app/globals.css
git commit -m "Redesign: TFEX page dark band and chart colors"
```

---

## Task 6: Borderless rows for the remaining tables (`app/globals.css` only)

Applies the `research-table` pattern (spec §3.3/§4) to every other `<Table>` in the app: Assets (`app/dashboard.tsx`), Transactions/TFEX-trades/Cash-history (`app/portfolio-workspace.tsx`'s `.holdings` tables). All of these already share the same `.holdings`/`.platform-pill`/`.asset-identity` classNames today, so this is a pure CSS-selector task — no `.tsx` file needs an edit; the existing markup picks up the new look automatically once the shared classes change.

**Files:**
- Modify: `app/globals.css`

**Interfaces:**
- Produces: nothing new consumed by later tasks — this is the last table-styling task.

- [ ] **Step 1: Replace `.holdings` table CSS with borderless rows**

In `app/globals.css`, find:
```
.holdings [data-slot=table-head]{font-size:10px;color:#94a088;height:40px;background:#fafbf8;font-weight:400;padding:0 23px;white-space:nowrap}.holdings [data-slot=table-cell]{padding:15px 23px;font-size:12px;white-space:nowrap}.holdings [data-slot=table-row]{border-color:#edf0e7}.holdings [data-slot=table-cell] small{display:block;font-size:10px;margin-top:4px}
```
Replace with:
```
.holdings [data-slot=table-head]{font-size:11px;color:var(--muted-slate);height:44px;background:transparent;font-weight:500;text-transform:uppercase;letter-spacing:.5px;padding:0 4px;white-space:nowrap;border-bottom:1px solid var(--hairline)}.holdings [data-slot=table-cell]{padding:16px 4px;font-size:13px;white-space:nowrap}.holdings [data-slot=table-row]{border-color:var(--hairline)}.holdings [data-slot=table-row]:last-child{border-bottom:none}.holdings [data-slot=table-cell] small{display:block;font-size:10px;margin-top:4px;color:var(--slate)}
```
(dropping the `background:#fafbf8` header fill and per-row shading is exactly the "unframed rows, rules, and open space" instruction in `DESIGN.md`'s Do's list; the `.panel.holdings` wrapper itself keeps its Task-1-restyled 16px radius/hairline border as the table's only frame, so it doesn't float with zero containment.)

Also update the two chip-ish classes used inside these tables:
```
.platform-pill{font-size:10px;padding:4px 8px;background:#f3f5ee;border:1px solid #e8ecdf;border-radius:4px;color:#7f8d70}
```
→
```
.platform-pill{font-size:10px;padding:4px 10px;background:transparent;border:1px solid var(--soft-coral);border-radius:9999px;color:#c85a3e}
```
(this is the `blog-filter-chip`-style coral outline pill from `DESIGN.md`, applied to the existing platform-name chips already rendered in these tables — no JSX change needed, `platform-pill` is already a plain className string built into each `<TableCell>` today.)

```
.asset-identity strong{font-size:12px;color:#3e4a37}.asset-identity small{color:#9ba28f}
```
→
```
.asset-identity strong{font-size:12px;color:var(--ink-black)}.asset-identity small{color:var(--muted-slate)}
```

- [ ] **Step 2: Verify**

```bash
node node_modules/typescript/bin/tsc --noEmit
npm run build
```

- [ ] **Step 3: Manual visual check**

Load, in turn: Overview (its "สินทรัพย์ของฉัน"/"รายการล่าสุด"/"บัญชีเงินสด" panels), "สินทรัพย์ของฉัน" (Assets), "รายการซื้อขาย" (Transactions), "บัญชีเงินสด" (Accounts, its ประวัติฝาก/ถอน sub-table), "แพลตฟอร์ม/โบรกเกอร์" is card-based already (unaffected), "บันทึกการเทรด TFEX"'s trades table. Every one of those tables should now show uppercase gray column headers with a single hairline rule under them, borderless data rows separated only by thin hairlines, and any platform-name chip rendered as a coral-outline pill instead of the old sage-green filled tag. No per-row shading. Check mobile width — the existing horizontal-scroll/stacking behavior for tables (already handled by the pre-existing responsive rules, untouched by this task) should still work.

- [ ] **Step 4: Commit**

```bash
git add app/globals.css
git commit -m "Redesign: borderless research-table rows across all tables"
```

---

## Task 7: Forms and dialogs (`app/portfolio-workspace.tsx`, `app/tfex-import-dialog.tsx`, `app/globals.css`)

**Files:**
- Modify: `app/globals.css`
- Modify: `app/portfolio-workspace.tsx` (`EntryDialog`'s `DialogContent` className)
- Modify: `app/tfex-import-dialog.tsx` (`DialogContent` className)

**Interfaces:**
- Produces: nothing new consumed elsewhere — last visual task before the docs update.

- [ ] **Step 1: Restyle the shared form-field CSS**

In `app/globals.css`, find:
```
.form-field{display:flex;flex-direction:column;gap:7px;font-size:14px}.form-field input,.form-field textarea{border:1px solid #dbe3d5;padding:10px 12px;border-radius:7px;background:white;width:100%;font-size:14px}
```
Replace with:
```
.form-field{display:flex;flex-direction:column;gap:7px;font-size:14px}.form-field input,.form-field textarea{border:1px solid var(--border-light);padding:12px 14px;border-radius:10px;background:white;width:100%;font-size:14px}.form-field input:focus,.form-field textarea:focus{outline:2px solid var(--focus-blue);outline-offset:1px;border-color:var(--focus-blue)}
```

Also update the error-message box to use the new palette:
```
.error-message{padding:12px;color:#a3473c;background:#fff0ec;border-radius:6px;font-size:14px}
```
→
```
.error-message{padding:12px;color:var(--loss-red);background:#fdecec;border-radius:10px;font-size:14px}
```

- [ ] **Step 2: Recolor the two dialogs' hard-coded inline background overrides**

Both dialog components override their background with an inline Tailwind arbitrary-value class rather than a plain CSS rule, so this edit happens directly in the `.tsx` files, not `globals.css`.

In `app/portfolio-workspace.tsx`, find (inside `EntryDialog`):
```tsx
 return <Dialog open={!!modal} onOpenChange={v=>{if(!v&&!busy)close()}}><DialogContent className="!max-w-[570px] max-h-[90dvh] overflow-y-auto !bg-[#fcfdf9] !rounded-xl !p-7">
```
Replace with:
```tsx
 return <Dialog open={!!modal} onOpenChange={v=>{if(!v&&!busy)close()}}><DialogContent className="!max-w-[570px] max-h-[90dvh] overflow-y-auto !bg-white !rounded-2xl !p-7">
```

In `app/tfex-import-dialog.tsx`, find:
```tsx
 return <Dialog open onOpenChange={open=>{if(!open&&!busy)close();}}><DialogContent showCloseButton={false} className="!max-w-[min(1100px,calc(100%-2rem))] max-h-[90dvh] overflow-y-auto !bg-[#fcfdf9] !rounded-xl">
```
Replace with:
```tsx
 return <Dialog open onOpenChange={open=>{if(!open&&!busy)close();}}><DialogContent showCloseButton={false} className="!max-w-[min(1100px,calc(100%-2rem))] max-h-[90dvh] overflow-y-auto !bg-white !rounded-2xl">
```
(`!rounded-xl` is Tailwind's ~12px; `!rounded-2xl` is ~16px, matching the spec's `radius-md` card token — the old `#fcfdf9` was a faint green-white tint that no longer belongs on an otherwise pure-white system.)

- [ ] **Step 3: Verify**

```bash
node node_modules/typescript/bin/tsc --noEmit
npm run build
```

- [ ] **Step 4: Manual visual check**

Open every dialog kind at least once: a trade entry (`+ บันทึกรายการ` from Assets/Transactions), a TFEX trade entry, a cash deposit, a platform, an account, an FX-rate edit, and the Pi PDF import dialog. Confirm: pure white dialog background (no green tint), 16px-ish rounded corners, input borders in the new light gray, and a visible blue focus ring when tabbing into a field. Confirm a deliberately-triggered validation error (e.g. leave a required field empty and submit) renders the new flat red error box.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css app/portfolio-workspace.tsx app/tfex-import-dialog.tsx
git commit -m "Redesign: forms and dialogs"
```

---

## Task 8: Update `AGENTS.md`'s green-palette clause

**Files:**
- Modify: `AGENTS.md`

**Interfaces:** none — documentation only, last task.

- [ ] **Step 1: Update the wording**

In `AGENTS.md`, find the line (already amended once earlier this session for the TFEX-chart historical-data distinction — this edit layers on top of that, not reverting it):
```
Preserve the Thai interface, green palette, and responsive workspace layout.
```
Replace with:
```
Preserve the Thai interface and the responsive workspace layout. The UI's visual system is Cohere-style (black/navy/coral/blue, IBM Plex Sans/IBM Plex Sans Thai) per `docs/superpowers/specs/2026-09-15-cohere-redesign-design.md` — financial gain/loss stays green/red on light surfaces (the one deliberate carve-out; see that spec's §1.5) and white/blue/coral on the TFEX dark band (§1.6). Don't reintroduce the pre-redesign green brand identity elsewhere.
```

- [ ] **Step 2: Verify**

```bash
grep -n "green palette" AGENTS.md README.md
```
Expected: no remaining match (confirms the old clause is fully replaced, not duplicated).

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md
git commit -m "Redesign: update AGENTS.md palette guidance"
```

---

## Final full-suite verification (after Task 8)

Run once, covering everything touched across all 8 tasks:

```bash
node --experimental-strip-types --test tests/portfolio.test.ts tests/auth.test.ts tests/pi-tfex.test.ts
node node_modules/typescript/bin/tsc --noEmit
npm run lint
npm run build
```

All four must be clean (the test suite should be unaffected — this plan never touches `lib/*.ts` logic — this run exists to prove that claim, not because any task expects it to catch something new). Then do one final end-to-end manual pass: sign in, visit every nav item once, confirm nothing regressed from the per-task checks above, and check both desktop and mobile widths on the Overview and TFEX pages specifically (the two pages with the most structural JSX change).

Do **not** deploy to pve1 as part of this plan — ask the owner first, same as every prior feature this session.
