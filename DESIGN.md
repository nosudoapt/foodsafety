# FoodSafe — Style Reference

> **"The Pass"** — a quiet porcelain counter where the food-safety register lives. Warm off-white paper, near-black ink, and a single deep cassis that the visitor can swap for one of four kitchen date-dot colours. Editorial serif headlines, grotesque UI, no shadows. The colour system is the product's own vernacular: the day-dot labels a kitchen sticks on prep, used here as the brand mark and the theme switch.

**Theme:** light

This is not a clone of 7shifts. It borrows the *energy budget* — one bright action colour, warm neutral canvas, a rotating set of pastel accents, generous pill CTAs — and moves it in the opposite direction: where 7shifts is a bright diner with indigo buttons and orange chalk scribbles, FoodSafe is a linen tablecloth with a date dot on it. No script font, no hand-drawn underline, no gradient buttons.

## The one idea

A kitchen labels every container with a **day dot**: a coloured sticker showing when the prep was made. Those dots are colour-coded, and the colours are the only saturated thing in the kitchen.

So the brand mark *is* a dial of five day dots, and **clicking the logo changes the accent colour of the entire page**. The palette is not a brand decree — it is a choice the owner makes. That is the interaction nobody else has, and it is the reason the identity is memorable.

## Tokens — Colors

### Base (fixed)

| Name | Value | Token | Role |
|------|-------|-------|------|
| Porcelain | `#f7f3ec` | `--paper` | Page canvas. Warm, not cream-pastel; reads as paper stock. |
| Linen | `#f1ebe0` | `--paper-2` | Secondary bands, demo panel, nav hover |
| Sand | `#e9e1d3` | `--paper-3` | Meter troughs, deepest neutral fill |
| Ink | `#14100f` | `--ink` | Primary text and the full-bleed dark band. Warm black, never `#000`. |
| Ink Raised | `#1d1816` | `--ink-2` | Cards sitting inside the dark band |
| Rule | `#dbd2c3` | `--line` | Structural hairlines, card borders, dividers |
| Rule Soft | `#e8e1d5` | `--line-soft` | Intra-card rules, table rows |
| Smoke | `#6d6459` | `--muted` | Body copy, captions, helper text |
| Cassis | `#4a1b3d` | `--brand` | Primary action fill. Deep wine-plum — luxury without shouting. |
| Cassis Deep | `#2f1027` | `--brand-2` | Primary hover |

### Switchable accent — the day dots

The page carries `data-dot="cassis|pistachio|butter|coral|sky"`. Each theme sets six tokens:

- `--dot` — the solid fill (seal, check badges, accent card icons, meters, tags)
- `--dot-soft` — the tint (hero highlighter band, accent feature card, pills)
- `--dot-line` — a hairline that sits against the tint
- `--dot-on` — text drawn **on the solid fill**
- `--dot-fg` — marks drawn **on the soft tint**
- `--dot-text` — accent marks drawn **on the black band**

| Theme | `--dot` | `--dot-soft` | `--dot-on` | `--dot-fg` | `--dot-text` |
|---|---|---|---|---|---|
| Cassis (default) | `#5b1e3b` | `#f0e2e9` | `#ffffff` | `#4a1b3d` | `#f0a8c6` |
| Pistachio | `#cde27a` | `#eff6d6` | `#241a10` | `#3c4a17` | `#dff2a4` |
| Butter | `#f7cb5b` | `#fbf0d3` | `#241a10` | `#4a3a10` | `#ffdd8f` |
| Coral | `#f47b5c` | `#fbe4dc` | `#2a1208` | `#5a2416` | `#ffa98f` |
| Sky | `#a9c7e8` | `#e6eff9` | `#14100f` | `#1d3550` | `#c3dcf5` |

> **Why three ink tones.** One accent cannot be legible in every position. Cassis needs white on its fill but a pale rose on black; Pistachio needs near-black on its fill but a deep olive for a check mark on its own tint. Collapsing these into a single `--dot-ink` produced 1.1–1.8:1 contrast. The three-tone split is what keeps every combination above 4.5:1.

Every theme was verified to clear WCAG AA (4.5:1) for: icon on fill, tag on fill, marker on black band, body copy on tint.

## Tokens — Typography

### Display — editorial serif

`DM Serif Display` → Georgia → serif, exposed through `--font-display`.

Self-hosted WOFF2 files in `src/app/fonts/`, loaded through `next/font/local`. The same face is used on marketing, authentication and both workspaces, independent of the device’s installed fonts. The font licence is included alongside the files.

- Weights: 400 only. The didone's stroke contrast is the personality; bolding it kills it.
- Sizes: display `clamp(2.9rem, 6.4vw, 5.4rem)`, h2 `clamp(2rem, 3.9vw, 3.35rem)`, h3 `clamp(1.35rem, 1.9vw, 1.7rem)`.
- Line height 0.94 at display, 1.02–1.12 at section level.
- Tracking `-0.028em` at display, loosening to `-0.014em` at h3.
- Italic is used **once**, on the word "before" in the hero, as a typographic hinge. That is the entire budget for italic.

### UI — neo-grotesque

`DM Sans` → system-ui → sans-serif, exposed through `--font-sans` and self-hosted with the display face.

- 400 body, 500 nav/UI, 600 buttons and card titles, 700 only for the small footer column headings.
- Body 15px/1.62 at 46–53 characters. Lede `clamp(1rem, 1.35vw, 1.125rem)`/1.6 at 46ch.
- Captions 13px, micro-labels 12px, mono-numerals via `font-variant-numeric: tabular-nums` on all log times and prices.

### Type scale in use

| Role | Family | Weight | Size | LH | Tracking |
|---|---|---|---|---|---|
| display | didone | 400 | 46–86px | 0.94 | −0.028em |
| h2 | didone | 400 | 32–54px | 1.02 | −0.022em |
| h3 / card title | didone | 400 | 22–27px | 1.12 | −0.014em |
| h4 | sans | 600 | 17px | 1.3 | −0.012em |
| lede | sans | 400 | 16–18px | 1.6 | 0 |
| body | sans | 400 | 15px | 1.62 | 0 |
| small | sans | 400 | 13px | 1.5 | 0 |
| micro | sans | 700 | 12px | 1.4 | +0.01em |

## Tokens — Spacing & Shapes

Base unit **4px**. Density: airy at the section level, compact inside cards.

| Scale | Value |
|---|---|
| 4 / 8 / 10 / 12 / 14 | micro gaps |
| 18 / 22 / 24 | card padding |
| 32 / 40 / 44 | column gaps |
| 64 / 96 / 128 | section padding (fluid `clamp`) |

**Radii** — four sizes, each with a job:

| Element | Radius |
|---|---|
| Buttons, tags, chips, dots | `999px` |
| Feature grid, plans, demo, closing band | `22px` |
| Tickets, logs, stat blocks | `14px` |
| Menu button, small controls | `8px` |

**Layout** — 1240px content well, fluid gutters `clamp(20px, 5vw, 48px)`. Asymmetry is deliberate: the hero is `1.08fr / 0.92fr` (text slightly wider), and section headers are `0.9fr / 1.1fr` with the margin annotation in the narrow left column.

## Components

### Day-dot dial (logo)
40px circle, hairline border, five 2.6px dots on a 72° dial with the active colour at twelve o'clock and ringed in ink. The core dot pulses on hover. Click rotates the dial 72° and swaps the page theme. Footer wordmark uses the same mark with `interactive={false}`.

### Dot picker
Row of five 18px dots in a pill. Active dot gets a double ring (paper then ink) — not a border colour change, so it reads on any background. In the nav on desktop; inside the mobile menu on small screens.

### Primary button
Cassis fill, white 15/600 text, `999px`, 13×22px padding, an inset top highlight and one soft coloured shadow. Hover darkens to `--brand-2`. This is the only filled chromatic button; the closing band instead uses a **white** primary so the dark section still has a strong CTA.

### Secondary button
Transparent with a 1px ink border, inverting to ink fill on hover. Never a second colour.

### Ticket
The hero's product proof. A perforated top edge drawn with a repeating radial-gradient, a 9px dashed rule, then rows separated by hairlines. Three tickets sit in a stack, each rotated −2.1° / +1.2° / −0.6°; on hover the stack fans further apart. No drop shadows except one very soft contact shadow.

### Rotating seal
116px accent circle at the hero's bottom-right. SVG `textPath` on a real circular path, 24s linear rotation, pauses on hover. Reads "DAILY ROUTINES · EVERY SHIFT · EVERY SITE ·" around "6 roles / one workspace".

### Feature grid
A 2×2 grid with **1px gutters achieved by a line-coloured background showing through**, not borders on each card — so there are no doubled borders at the seams. One cell is the accent (`--dot-soft`) with an accent icon; the rest are paper. Each cell has a 42px ink icon tile, a didone title, sans body, and a footer line.

### Comparison pair
Two 22px cards side by side. Left is ink-raised with muted body and a dark ✕ badge; right is porcelain with ink body and an accent ✓ badge. The badge circles are 22px and align to the first text line.

### Live-log module
Tablist with roving tabindex (arrows, Home, End), a real `role="tabpanel"`, and four data sets — temperature, prep, cleaning, renewals — using actual product vocabulary and plausible readings. Left column is the log sheet; right column is a stat with a meter that re-animates on tab change. Panel fades in 6px on switch.

### Marquee rail
Full-bleed ink band. Eight capability phrases, each preceded by one of the five dot colours, duplicated for a seamless 46s loop. Pauses on hover; hidden from assistive tech (`aria-hidden`).

### Plan card
Featureless by default; the featured plan is full ink with an accent "Most popular" tag. Price is didone at `clamp(2.4rem, 3.4vw, 3rem)` with tabular numerals; the `/mo` suffix drops to sans 13px.

## Do's and Don'ts

### Do
- Use **Cassis `#4a1b3d`** for every filled primary action; let the switchable dot own the accents.
- Put the accent on **one** feature cell, the seal, the check badges and the meter — not on every card.
- Use the didone for anything that names a thing (headline, section, card title, price) and the grotesque for anything you read in a sentence.
- Use realistic product vocabulary in the hero tickets and log preview; clearly identify preview figures as **sample data**.
- Alternate porcelain sections with a single full-bleed ink band to create rhythm. One dark band is enough.
- Animate only what the user acts on: the dial, the ticket fan, the tab panel, the meters. The page-load reveal fires once per element and then never again.

### Don't
- Don't use `#000000`. All "black" is `--ink` `#14100f`, which is warm and sits correctly against porcelain.
- Don't put a drop shadow on cards. Depth comes from fill contrast (paper on linen, ink on paper). The only shadows are the button's coloured glow and the ticket's single contact shadow.
- Don't use the didone below 22px or for body copy — at small sizes it turns into a spindly default serif.
- Don't introduce a sixth accent colour. The five dots are the palette; adding one breaks the premise.
- Don't apply the accent to body text. It is a surface and a mark, never a reading colour.
- Don't collapse `--dot-on` / `--dot-fg` / `--dot-text` back into one token. That is exactly the bug that produced 1.1:1 contrast.
- Don't add all-caps eyebrows. The only uppercase is the 12px footer column heading and the seal text.

## Surfaces

| Level | Name | Value | Purpose |
|---|---|---|---|
| 0 | Porcelain | `#f7f3ec` | Page canvas, cards on dark, plan cards |
| 1 | Linen | `#f1ebe0` | Demo panel, nav hover, quiet bands |
| 2 | Sand | `#e9e1d3` | Meter troughs, deepest neutral |
| 3 | Ink | `#14100f` | Full-bleed comparison band, closing band, footer CTAs |
| 4 | Accent tint | `--dot-soft` | Hero highlighter, one feature cell, pills |

## Elevation

There is no shadow scale. Depth is communicated three ways: fill contrast (porcelain card on linen band), the ink band as a hard full-bleed separator, and hairlines between adjacent cells. The only shadows in the system are the primary button's coloured underglow and the ticket stack's single soft contact shadow.

## Imagery

No photography, no illustration, no 3D. The visual weight is entirely typographic and structural. The "product" is shown as **tickets and log rows** — the literal artefacts of the job — rather than as a floating app screenshot. Icons are Lucide at 1.8–2.6 stroke, 13–20px, used structurally (which log type, which capability) rather than decoratively.

## Motion

- **One orchestrated entrance**: sections fade up 18px over 700ms when first intersecting, then never animate again. Stagger 80ms between grouped items.
- **Action responses**: dial rotates 0.85s; tickets fan 0.55s; tab panel fades 0.35s; meters fill 0.6s; color transitions 0.45s.
- **Ambient**: the seal rotates at 24s, the rail at 46s, the live dot pulses at 2.4s. All pause on hover or reduced-motion.
- `prefers-reduced-motion: reduce` kills every keyframe and clamps color transitions to 0.001ms, while still applying the new colour instantly.

## Accessibility

- Skip link to `#main`, hidden until focused.
- Interactive controls have accessible names; labels stay visible on working forms.
- Visible `:focus-visible` ring in `--brand` with 3px offset.
- Tablist implements roving tabindex + arrow/Home/End keys.
- Body contrast 5.25:1; all accent-on-surface combinations ≥ 4.5:1 across all five themes.
- Mobile menu is a real disclosure (`aria-expanded`, `aria-controls`) and duplicates the accent picker so the theme is switchable on touch.

## Agent Prompt Guide

Quick reference:
- primary action: `#4a1b3d` (cassis fill, white text)
- accent (default): `#5b1e3b` solid · `#f0e2e9` tint · `#f0a8c6` on black
- text primary: `#14100f` · secondary: `#6d6459`
- surface: `#f7f3ec` paper · `#f1ebe0` linen
- rule: `#dbd2c3`
- display face: DM Serif Display, 400, −0.028em
- UI face: DM Sans, 400–700

Example prompts:

1. *Hero* — Porcelain canvas. Left column: a short purpose line ("A clearer day, from the first check"), then a 4-line didone headline at `clamp(2.9rem,6.4vw,5.4rem)`, 0.94 line-height, with the phrase "written down" on a `--dot-soft` highlighter band. 18px smoke lede at 46ch. One cassis pill CTA and one ink-outline CTA. Right column: three sample tickets in a fan with an accent seal overlapping the bottom-right. No hero image.

2. *Comparison band* — Full-bleed `#14100f`. A rotated margin annotation in `--dot-text` on the left; a 54px porcelain didone heading on the right. Below: two 22px cards — left `#1d1816` with muted copy and dark ✕ badges, right porcelain with ink copy and accent ✓ badges.

3. *Feature grid* — 2×2 with 1px ink-free gutters created by a `#dbd2c3` background showing through. Three porcelain cells, one `--dot-soft` cell with an accent icon tile. 42px ink icon tiles, didone titles at 23px, 15px body, a 12px footer line.

4. *Live log* — Linen panel at 22px radius. Four tabs in a pill row with the active tab filled ink. Below, a two-column split: a white log sheet with tabular-numeral timestamps and green/amber status words, and a stat card with a didone number and an accent meter.

5. *Closing band* — Ink panel at 22px radius with a large soft accent circle bleeding off the top-right corner at 16% opacity. Porcelain didone heading, muted body, then a **white** primary button and a paper-outline secondary.

## Similar Brands

- **Toast** — restaurant SaaS; shares the pill CTA and warm neutral canvas, but Toast is product-dense and photographic. FoodSafe stays editorial and typographic.
- **Linear** — shares tight negative tracking and a single saturated action colour, but Linear is dark-first and motion-heavy where FoodSafe is paper-first and still.
- **Aesop / luxury retail** — shares the porcelain surface, didone display, and refusal of shadow. FoodSafe adds a switchable accent and a live product module to what is otherwise a very quiet system.

## Working application

The same tokens and self-hosted fonts now cover FoodSafe, authentication and BTB. `src/app/workspace.css` owns the shared working-screen styles, including the compatibility styles for existing registers.

- **Shells:** dark FoodSafe navigation rail, quiet paper top bar and a compact BTB header. Page search and tool directories show the signed-in role’s available tools.
- **Dashboards:** a role-specific briefing, linked metrics, priorities, recent records and quick actions. Group roles can compare connected sites. Missing reads show unavailable data with retries.
- **Forms:** use `Button`, `Input`, `Badge` and `PageHeader` from `src/components/ui.tsx`. Place save feedback beside its form and keep drafts after a rejected save.
- **Dialogs:** use `src/components/Modal.tsx` for native focus containment, Escape handling, background scroll locking and focus restoration. Mark the intended initial field with `data-modal-autofocus` so it receives focus each time the dialog opens. Show an explicit busy state during writes.
- **Tabs:** `TabList` provides arrow/Home/End navigation, roving tab stops and IDs for labelled panels. Filters use pressed buttons rather than tab semantics.
- **Registers:** readable cards with a clear title, useful metadata and visible actions. Campaigns precede the social planner; artwork dimensions are expandable reference material.
- **Responsive layout:** reduce card columns and wrap toolbars on small screens. Wide inventory tables scroll inside their own region. Preserve labels, browser zoom and visible keyboard focus.
- **Status colour:** green, amber and red communicate a named state; plum remains the primary action colour. Never present a failed read as a zero or an all-clear result.

See `UI_HANDOFF.md` for the implementation map, verification commands and the next integration point.
