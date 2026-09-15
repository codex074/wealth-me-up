# wealth-me-up visual redesign: Cohere design system

## 1. Context and intent

The owner wants wealth-me-up's entire UI redesigned to adopt the visual language
documented in `DESIGN.md` (a design-system extraction of Cohere's marketing
website — an AI company's public site, not a financial app). This is a deliberate
choice, made after the tension with the existing product decision was raised and
discussed directly:

- `AGENTS.md` currently says **"Preserve the Thai interface, green palette, and
  responsive workspace layout."** This spec supersedes the "green palette" clause.
  Every other clause (Thai interface, responsive layout, the accounting/product
  behavior sections) stays in force — this is a **visual-layer redesign only**. No
  accounting logic, data model, auth flow, or product behavior changes.
- Cohere's design system is built for a marketing/editorial site (hero banners,
  blog taxonomy chips, trust-logo strips, research paper listings, agent-console
  product mockups). wealth-me-up is a logged-in-only personal finance journal with
  no blog, no research papers, no customers to show as trust logos. Several
  `DESIGN.md` components (`blog-filter-chip`, `trust-logo-strip`, `hero-photo-card`,
  `agent-console-card`, `research-table`'s literal "publication list" framing,
  `footer-newsletter`) do not have a real counterpart here and are **not** ported —
  see §4 for the explicit component mapping and what's dropped.
- Decisions below were made through a visual comparison session (mockups shown in
  a browser, user picked directly) plus targeted questions. Where a decision
  deviates from a literal reading of `DESIGN.md`, the reason is stated inline.

**Confirmed decisions (do not re-derive/re-ask):**

1. **Full color adoption**: black/near-black, dark navy, coral, Action Blue —
   not just spacing/shape borrowed with the green kept. One exception (below).
2. **Compositional redesign**, not a skin swap: each page's *layout* changes to
   Cohere's page-composition grammar (oversized headline number, alternating
   flat/dark bands, borderless rule-separated rows instead of boxed grid tables) —
   not just recoloring the existing card grid in place.
3. **Keep the left sidebar**, reskinned to the new palette (near-black sidebar,
   white text) — chosen over Cohere's literal three-zone top nav because
   wealth-me-up has 6 persistent sections used daily; a sidebar switches between
   them faster than a top-nav + sub-pill-row pattern would.
4. **Font**: `IBM Plex Sans` (Latin) + `IBM Plex Sans Thai` (Thai script) — chosen
   over `DESIGN.md`'s literal fallback (`Space Grotesk`/`Inter`, Latin-only) because
   wealth-me-up is a fully Thai-language app and there is no single font family
   that covers both scripts *and* matches Cohere exactly; IBM Plex is the closest
   available match to Cohere's "tight, almost monospaced, research-lab" character
   that also ships a proper Thai companion face in the same family, so Thai and
   Latin text share one visual voice instead of visibly clashing fonts.
5. **Financial positive/negative color is the one carve-out from full Cohere
   adoption**: on light (white) surfaces, keep the existing green `#50854a` /
   red `#b30000` (Cohere's own Error Red — already in `DESIGN.md`'s palette, just
   repurposed) pair for gains/losses, rather than switching to Action Blue/Coral.
   Reason: green-for-gain/red-for-loss is a near-universal financial-data
   convention; remapping it to blue/coral would cost recognizability for no
   real brand-consistency gain, since Cohere's own site has no financial-data
   UI to be consistent *with*. This is the only place green survives.
6. **Dark-band chart variant** (the TFEX cumulative-P&L chart, already shipped):
   on the navy `dark-feature-band`, the line itself is **white** (`#ffffff`,
   always-visible regardless of color vision), and the headline/tooltip number's
   text color becomes **Action Blue `#1863dc`** when the value is ≥0 and
   **Coral `#ff7759`** when negative. Checked with the dataviz skill's palette
   validator against a dark surface: contrast ≥3:1 for both, and since the two
   colors are never shown simultaneously as adjacent marks (only one number is
   ever displayed at a time — the current headline/tooltip value), the
   categorical CVD-adjacency check doesn't apply; this is a lone status-color
   contrast case, which passed.

## 2. Design tokens

### 2.1 Color

| Token | Value | Role | Source |
|---|---|---|---|
| `ink-black` | `#17171c` | Primary text on light surfaces, sidebar background, primary button fill | `DESIGN.md` Near-Black Primary |
| `pure-black` | `#000000` | Reserved for the rare highest-contrast accent (not a base UI color) | `DESIGN.md` Cohere Black |
| `navy` | `#071829` | Dark band background (TFEX performance band, any "financial/security" toned section) | `DESIGN.md` Dark Navy |
| `action-blue` | `#1863dc` | Links, positive-value text on dark bands, secondary emphasis | `DESIGN.md` Action Blue |
| `coral` | `#ff7759` | Chips/tags, negative-value text on dark bands | `DESIGN.md` Coral |
| `soft-coral` | `#ffad9b` | Pale chip borders | `DESIGN.md` Soft Coral |
| `canvas-white` | `#ffffff` | Default page/card background | `DESIGN.md` Canvas White |
| `soft-stone` | `#eeece7` | Warm neutral card fill (used sparingly — Cohere's own guidance: not every section is a card) | `DESIGN.md` Soft Stone |
| `ink` | `#212121` | Default body text | `DESIGN.md` Ink |
| `muted-slate` | `#93939f` | Secondary text, eyebrow labels, metadata | `DESIGN.md` Muted Slate |
| `slate` | `#75758a` | Tertiary text, panel subtitles | `DESIGN.md` Slate |
| `hairline` | `#d9d9dd` | Row separators (replaces most card `box-shadow`/borders) | `DESIGN.md` Hairline |
| `border-light` | `#e5e7eb` | Card borders, form input borders | `DESIGN.md` Border Light |
| `focus-blue` | `#4c6ee6` | Focus ring | `DESIGN.md` Focus Blue |
| **`gain-green`** | `#50854a` | **Financial-only**: positive amounts on light surfaces | Existing app `.positive`, kept — see §1.5 |
| **`loss-red`** | `#b30000` | **Financial-only**: negative amounts on light surfaces | `DESIGN.md` Error Red, repurposed — see §1.5 |
| `dark-positive` | `#1863dc` | Financial-only: positive amounts on the navy TFEX band | §1.6 |
| `dark-negative` | `#ff7759` | Financial-only: negative amounts on the navy TFEX band | §1.6 |

Dark-band surface text: default to white `#ffffff` for headings/values, `#93a8c2`-ish
muted blue-gray for secondary/eyebrow text on navy (a lightened, desaturated navy
tint — analogous to how `DESIGN.md`'s `dark-feature-band` describes "text turns
white; cards use darker translucent surfaces, pale borders").

### 2.2 Typography

Font stack: `'IBM Plex Sans Thai', 'IBM Plex Sans', ui-sans-serif, system-ui` for
everything (one stack, not a display/body split by font-family — IBM Plex Sans
covers both roles across its weight range, unlike Cohere's separate
CohereText/Unica77/CohereMono trio, since we don't have three proprietary faces to
begin with). Load via Google Fonts (`IBM+Plex+Sans+Thai` + `IBM+Plex+Sans`,
weights 400/500/600/700) — replaces the current `"Noto Sans Thai","Avenir Next",Tahoma,Arial,sans-serif`
stack in `app/globals.css`'s `body` rule.

| Role | Size | Weight | Line height | Letter spacing | Used for |
|---|---:|---:|---:|---:|---|
| Hero Display | 64px | 400 | 0.95 | -2px | The one oversized number per page (total wealth on Overview, net P&L on TFEX, login headline) |
| Section Heading | 32px | 500 | 1.1 | -0.5px | `h1` page titles (replaces current 29px) |
| Card Heading | 18px | 600 | 1.3 | -0.2px | `h2` panel/section headings |
| Body | 16px | 400 | 1.5 | 0 | Default copy |
| Label | 12px | 500 | 1.4 | 0 | Stat labels, table headers (uppercase, `muted-slate`) |
| Eyebrow | 11px | 600 | 1.3 | 1.5px | Small uppercase kicker above a hero number (`letter-spacing` positive, uppercase) |
| Caption | 12px | 400 | 1.5 | 0 | Metadata, help text |

Kept much flatter than `DESIGN.md`'s literal hierarchy (which has 8 display/heading
sizes for a marketing site with many section types) — wealth-me-up has far fewer
heading contexts, so the hierarchy is trimmed to what's actually used.

### 2.3 Spacing & radius

Keep the existing spacing values already in `app/globals.css` (8px-based with the
same one-off values Cohere's own system uses: 8/12/16/20/24/32px etc. — no change
needed, they already match). Radius scale changes:

| Token | Value | Replaces | Used for |
|---|---:|---|---|
| `radius-sm` | 8px | current 5-7px on `.btn`, `.platform-pill`, small pills | Chips, small buttons |
| `radius-md` | 16px | current 10px on `.panel`, `.stat-card` | Cards, panels |
| `radius-lg` | 22px | — (new) | The hero/band containers (large "signature" radius per `DESIGN.md`) |
| `radius-pill` | 9999px | — (new, `.btn.primary` currently square-ish 7px) | Primary CTA buttons — becomes a true pill |

### 2.4 Elevation

Drop `box-shadow` everywhere it exists today (`.btn.primary` has a subtle shadow;
`components/ui/*` dialog/popover shadows stay as-is, those are floating-layer UI,
not page surfaces). Page-level depth comes from flat surfaces + 1px hairline
borders + the navy band's solid color contrast, per `DESIGN.md`'s "Cohere is
mostly flat" principle.

## 3. Page composition grammar (the "Approach B" pattern, confirmed via mockup)

Every primary page (Overview, TFEX; Assets/Transactions/Cash/Platforms follow the
same skeleton minus the band where there's nothing band-worthy) now composes as:

1. **Hero block**: small uppercase eyebrow label (e.g. "YOUR WEALTH, IN ONE
   PLACE" / "TFEX PERFORMANCE") + one Hero Display number + one line of muted
   context text. Left-aligned, generous top/bottom padding (40px/32px), no card
   border — sits directly on the page background.
2. **Dark band** (only where there's a real secondary "system" worth
   foregrounding — TFEX's P&L summary + the new chart is the concrete instance
   shipped so far): full-bleed navy `#071829` rounded block (22px radius),
   white text, 2-column stat grid inside for secondary numbers.
3. **Borderless rows** replace boxed data-grid tables: each row is a
   `hairline`-bottom-bordered flex row (no per-cell borders, no zebra striping),
   14px vertical padding, no table chrome — this is `DESIGN.md`'s `research-table`
   pattern adapted (title/identity left, secondary info as small coral-outline
   chips, value right).
4. **Primary CTA**: one `radius-pill`, `ink-black`-fill button per page ("+
   บันทึกรายการ" etc.) — never more than one filled pill per view; any secondary
   action is an underlined text link (`button-secondary` per `DESIGN.md`), not a
   second filled button.

This matches the approved "แบบ B" mockup exactly (hero → dark band → borderless
rows → single CTA).

## 4. Component mapping

| `DESIGN.md` component | wealth-me-up equivalent | Notes |
|---|---|---|
| `button-primary` | `.btn.primary` (CSS class, not `components/ui/button.tsx` — confirmed the app never imports that shadcn component; every button is a plain `<button className="btn ...">`) | Becomes pill radius, `ink-black` fill |
| `button-secondary` | `.text-button` | Already underlined-link-ish; recolor to `action-blue` |
| `button-pill-outline` | New: TFEX chart's mode `Tabs`/`TabsList.range-tabs` and period `Select` | Outlined pill instead of the current boxed tab look |
| `contact-form-card` | `EntryDialog` (`app/portfolio-workspace.tsx`), `TfexImportDialog` | Rounded white card, thin gray input borders, `ink-black` pill submit |
| `dark-feature-band` | New: TFEX performance band (chart already shipped, lives here now) | See §3.2 |
| `product-card` | Stat cards (`.stat-card`) on Overview/TFEX | 8-16px radius, hairline border, no shadow |
| `research-table` | Holdings/trades/TFEX tables (`.holdings` `<Table>`) | Borderless rows, see §3.3 |
| `blog-filter-chip` / `trust-logo-strip` / `hero-photo-card` / `agent-console-card` / `footer-newsletter` | **Not used** | No blog, no customer logos, no marketing hero photography, no newsletter in a logged-in finance app |
| `announcement-bar` | **Not used** | No site-wide announcements exist in this product |

## 5. Page-by-page plan

- **`app/login/page.tsx`**: the one page an unauthenticated visitor sees — closest
  to an actual Cohere hero moment. Centered card becomes: eyebrow "YOUR WEALTH, IN
  ONE PLACE", Hero Display "wealth me up", body copy, `ink-black` pill Google
  sign-in button, muted caption below. Canvas white background (no dark band — a
  login screen isn't the place for it).
- **`app/dashboard.tsx`** (shell + Overview page): sidebar → `ink-black` background,
  white nav text, active item gets a thin `coral` or `action-blue` left rule
  (pick `action-blue`, coral reserved for negative-financial/chip use per §1.5-1.6
  to avoid overloading coral's meaning). Overview's stat-cards grid restyled per
  §2.4/§4; the *existing* growth-panel placeholder (no historical valuation chart —
  untouched functionally, per the earlier TFEX-chart spec's explicit boundary)
  keeps its current logic, just restyled colors/radius. Allocation donut: recolor
  its `donutColors` array from the current greens to a navy/coral/muted-slate set.
- **`app/portfolio-workspace.tsx`** (`DataViews`): every `page===...` branch's
  stat-card grids and tables restyled per §2/§3/§4. The TFEX branch's stat-card
  trio + the shipped `TfexPnlChart` panel becomes the dark band (§3.2, §1.6);
  Assets/Transactions/Accounts/Platforms tables become borderless rows (§3.3).
  `EntryDialog`/`Picker` forms restyled per `contact-form-card` (§4).
- **`app/tfex-import-dialog.tsx`**: same `contact-form-card` treatment as
  `EntryDialog` — no structural change (it already works correctly, per the
  earlier multi-file-import work), only tokens.
- **`app/globals.css`**: this is where nearly all of the above actually lands —
  updating the `:root` custom properties, `body` font stack, `.btn`/`.panel`/
  `.stat-card`/`.holdings`/`.chart-*` rules in place, rather than rewriting JSX
  structure wholesale. Most of §3's "compositional" change is achievable by
  restructuring the JSX hero/band/rows markup in the two `.tsx` files above and
  letting new CSS classes do the visual work — not a full rewrite of every file.

## 6. Responsive behavior

Reuse the existing breakpoint values already in `app/globals.css`
(`max-width:1200px`, `max-width:767px`) — `DESIGN.md`'s breakpoint table
(425/640/768/1024/1440px) is finer-grained than this app needs and doesn't have to
be adopted wholesale; the *behaviors* it describes (cards collapse to 1 column,
nav goes compact, form rows stack) already exist in this app's mobile rules and
just get re-themed, not re-architected.

## 7. Explicitly out of scope

- Any accounting/business logic, data model, auth flow, or API behavior.
- The overview growth-panel's "no historical chart" placeholder logic (still
  correct — no historical price data exists; only its visual skin changes).
- The already-shipped TFEX chart's underlying data functions
  (`tfexPnlSeries`/`availableTfexPeriods`) and its light-mode green line — the
  light-mode chart (outside a dark band, if ever shown elsewhere) is unaffected;
  only the navy-band presentation gets the white-line/coral-negative treatment.
- Any new marketing/public content (blog, research listings, customer logos,
  newsletter) — this app doesn't have or need those pages.

## 8. Open risk to flag before implementation

Adopting `ink-black`/`navy`/`coral` as the dominant palette is a significant
visual departure for a daily-use personal tool the owner already knows by its
current green identity. This spec documents the owner's explicit choice (§1),
made after the conflict with `AGENTS.md` was surfaced directly — recorded here so
a future reader doesn't mistake this for an oversight. `AGENTS.md`'s "green
palette" clause should be updated to reflect this decision once implementation
lands (tracked as an implementation-plan task, not done as part of this spec).
