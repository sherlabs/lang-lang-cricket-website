---
# DESIGN.md: Lang Lang Cricket Club website (as built)
# Machine-readable tokens. Values are copied from the code. Nothing here is aspirational.
# Sources: tailwind.config.ts, app/globals.css, app/layout.tsx, components/**, app/**
# Names are the real Tailwind/CSS names in the code today. The proposed role-based
# names appear only in the "Theming for other clubs" section at the end of the prose.
name: Lang Lang Cricket Club
version: as-built 2026-10-03 (branch feat/payload-cms, pre-migration)
stack:
  tailwind: "^3.4.1"            # package.json; plugin tailwindcss-animate ^1.0.7
  shadcn_style: base-nova       # components.json; baseColor neutral
  primitives: "@base-ui/react ^1.7.0"
  icons: "@hugeicons/react ^1.1.10 + @hugeicons/core-free-icons ^4.3.0"   # components.json says "lucide", which is wrong
  dark_mode: none               # darkMode ["class"] is configured, but nothing ever sets .dark

colors:
  # Brand palette: hex literals at tailwind.config.ts:13-28 (not CSS variables)
  brand-black:      "#0B0B0D"   # main dark surface, headings, primary dark button
  brand-ink:        "#17171A"   # raised dark surface (mobile menu, dropdown, Player sponsor badge)
  brand-charcoal:   "#26262B"   # body text on light, hover for black buttons
  brand-gold:       "#F5B700"   # accent: CTAs, active nav, focus, selection
  brand-gold-dark:  "#C99400"   # start stop of the gradient rule
  brand-gold-light: "#FFD966"   # hover for gold buttons, end stop of the gradient rule, labels on dark
  brand-gold-pale:  "#FFF4CC"   # tinted surfaces (chips, callouts, date tiles, club ladder row)
  brand-gold-deep:  "#8A6500"   # small gold text on light (5.33:1 on white, 4.84:1 on gold-pale)
  brand-cream:      "#FAF7EF"   # alternate section band
  brand-stone:      "#F3F1EA"   # card fills, empty states, admin page background
  brand-grey:       "#5A5A62"   # muted body and intro copy
  brand-grey-light: "#6E6E76"   # captions, placeholders, empty-state text
  # Hard-coded duplicates outside the config (they leak through theming)
  focus-outline:    "#f5b700"   # globals.css :focus-visible and * outline-color
  selection-bg:     "#f5b700"   # globals.css ::selection
  selection-fg:     "#0b0b0d"
  placeholder-art:  ["#F5B700", "#C99400", "#FFD966", "#0B0B0D"]  # components/events/event-placeholder-art.tsx
  # Non-brand Tailwind colours
  error-text:       red-700     # also red-800
  error-surface:    red-50      # with ring-red-200
  danger-button:    red-700     # hover red-800 (Button variant "danger")
  heart:            rose-500    # one use: footer agency credit
  # shadcn semantic variables (globals.css :root). These are stock neutral oklch and NOT brand-mapped.
  shadcn:
    background: "oklch(1 0 0)"
    foreground: "oklch(0.145 0 0)"
    primary: "oklch(0.205 0 0)"
    primary-foreground: "oklch(0.985 0 0)"
    secondary: "oklch(0.97 0 0)"
    muted: "oklch(0.97 0 0)"
    accent: "oklch(0.97 0 0)"
    destructive: "oklch(0.577 0.245 27.325)"
    border: "oklch(0.922 0 0)"
    input: "oklch(0.922 0 0)"
    ring: "oklch(0.708 0 0)"
  opacity-conventions:
    on-light: { card-ring: brand-black/5, divider: brand-black/10, outline-border: brand-black/15, chip-ring: brand-gold/30, hover-ring: brand-gold/40, hover-ring-strong: brand-gold/60 }
    on-dark:  { hover-bg: white/5, border: white/10, glass-bg: white/10, glass-border: white/25, text-muted: white/60, text-body: white/75, text-strong: white/80 }
    overlays: { sticky-nav: brand-black/95 (brand-black/85 with backdrop-filter), dialog: brand-black/50, lightbox: brand-black/95, glow: brand-gold/10 to brand-gold/20 }

typography:
  families:
    font-body:    { family: Inter, weights: [400, 500, 600, 700], css_var: --font-body, tailwind: font-sans }
    font-heading: { family: Barlow Condensed, weights: [500, 600, 700], css_var: --font-heading, tailwind: font-heading }
    loading: next/font/google, subsets [latin], display swap, variables set on <body>; fallback "system-ui, sans-serif"
  utilities:
    display: "font-heading font-bold uppercase leading-none tracking-wide"
    eyebrow: "text-xs font-semibold uppercase tracking-[0.18em] text-brand-gold-deep"   # text-brand-gold on dark
    container-site: "mx-auto w-full max-w-6xl px-5 sm:px-8"
  scale:
    hero-h1:        "display text-6xl sm:text-7xl lg:text-8xl max-w-4xl text-balance"
    page-h1:        "display text-5xl sm:text-6xl lg:text-7xl max-w-3xl text-balance"
    section-h2:     "display mt-3 text-4xl sm:text-5xl text-balance"
    subsection-h2:  "display text-2xl"              # plus an h-px brand-black/10 rule and a count pill
    panel-title:    "display text-2xl"              # scorecard, stats tables, form cards
    footer-heading: "display text-lg text-brand-gold"
    wordmark:       "display text-xl"
    card-title:     "font-heading text-xl font-bold leading-tight tracking-tight"   # mixed case, not .display
    player-name:    "font-heading text-base font-bold"
    inter-title:    "font-bold tracking-tight"      # highlight cards; committee name adds text-lg
    hero-intro:     "text-lg sm:text-xl leading-relaxed text-white/80 max-w-xl"
    page-intro:     "text-lg leading-relaxed text-white/75 max-w-2xl"
    section-intro:  "text-base sm:text-lg leading-relaxed text-brand-grey"
    body:           "text-base (16px) leading-relaxed text-brand-grey | text-brand-charcoal"
    small:          "text-sm leading-relaxed text-brand-grey"
    micro-label:    "text-[11px] font-semibold uppercase tracking-[0.14em]"   # tracking-[0.18em] in nav and banner
    pull-quote:     "font-heading border-l-4 border-brand-gold pl-6 text-3xl sm:text-4xl lg:text-5xl font-semibold"
    long-form:      ".story-content: text-[17px] leading-[1.75] text-brand-charcoal; h2 text-2xl font-semibold; h3 text-xl font-semibold"

rounded:
  # lg/md/sm are redefined from --radius: 0.625rem (tailwind.config.ts borderRadius)
  sm:   "calc(var(--radius) - 4px)  = 6px"
  md:   "calc(var(--radius) - 2px)  = 8px"    # hand-written CTAs, nav items, crest tile, selects
  lg:   "var(--radius)              = 10px"   # Button component, icon chips, shadcn Input, error boxes
  xl:   "0.75rem = 12px"                      # tiles, form inputs, empty states, DateTile md, gallery
  2xl:  "1rem    = 16px"                      # the standard card
  3xl:  "1.5rem  = 24px"                      # feature and CTA panels, Platinum sponsor card
  full: "9999px"                              # pills, chips, avatars, search field, glow orbs

spacing:
  container: { max-width: 72rem (1152px), gutter: "20px (px-5), then 32px from sm (sm:px-8)" }
  breakpoints: { sm: 640px, md: 768px, lg: 1024px, xl: 1280px }   # Tailwind defaults; desktop nav appears at lg
  section-home:  "py-20 lg:py-28"
  section-inner: "py-16 lg:py-24 | py-12 lg:py-16"
  page-header:   "py-16 sm:py-20 lg:py-24"
  footer-offset: "mt-24"
  heading-to-content: "mt-10 | mt-12"
  card-padding:  "p-5 | p-6 (sm:p-8 on form cards)"
  tap-target:    "44px (min-h-11 / h-11 w-11 / Button size xl)"
  secondary-tap: "36px (min-h-9) for footer and contact link rows"

elevation:
  shadow-card:       "0 1px 2px rgba(11,11,13,0.04), 0 8px 24px -12px rgba(11,11,13,0.18)"
  shadow-card-hover: "0 2px 4px rgba(11,11,13,0.06), 0 18px 40px -16px rgba(11,11,13,0.28)"
  pairing: "always used with ring-1 ring-brand-black/5"
  gradient-rule: "h-1 bg-gradient-to-r from-brand-gold-dark via-brand-gold to-brand-gold-light"   # 4px; tops the nav, footer and admin nav
  glow-orb: "h-72 w-72 rounded-full bg-brand-gold/10..20 blur-3xl, absolute, pointer-events-none"

motion:
  duration-default: 200ms
  easing-default: "cubic-bezier(0.22, 1, 0.36, 1)"   # ease-out-quint
  image-zoom: "duration-300 | duration-500, group-hover:scale-105 (player card scale-[1.02])"
  hover-lift: "hover:-translate-y-0.5 + shadow-card-hover"
  enter: "animate-in fade-in-0 slide-in-from-top-1 | slide-in-from-top-2"   # tailwindcss-animate
  marquee: "sponsor-marquee translateX(0 to -50%), linear infinite, duration var(--marquee-duration, 40s); runtime max(24, n*5)s; pauses on hover or focus-within"
  reduced-motion: "marquee only"

components:
  card:            "rounded-2xl bg-white shadow-card ring-1 ring-brand-black/5 transition hover:-translate-y-0.5 hover:shadow-card-hover hover:ring-brand-gold/40"
  card-static:     "rounded-2xl bg-white shadow-card ring-1 ring-brand-black/5"     # tables, scorecards, form cards
  card-tinted:     "rounded-2xl bg-brand-stone p-6 ring-1 ring-brand-black/5 transition hover:bg-brand-gold-pale hover:ring-brand-gold/40"
  callout:         "rounded-2xl bg-brand-gold-pale p-5|p-6 ring-1 ring-brand-gold/30"
  empty-state:     "rounded-xl bg-brand-stone p-8 text-center text-sm text-brand-grey-light"
  error-box:       "rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200"
  icon-chip:       "flex h-10 w-10 items-center justify-center rounded-lg bg-brand-gold-pale text-brand-gold-deep ring-1 ring-brand-gold/30; group-hover:bg-brand-gold group-hover:text-brand-black"
  count-pill:      "rounded-full bg-brand-gold-pale px-2.5 py-0.5 text-xs font-semibold tabular-nums text-brand-gold-deep"
  tag-pill:        "rounded-full bg-brand-gold-pale px-2 py-0.5 text-[11px] text-brand-gold-deep ring-1 ring-brand-gold/30"
  image-badge:     "rounded-full bg-brand-black/85 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-gold-light backdrop-blur"
  cta-gold:        "rounded-md bg-brand-gold px-5 py-3 text-sm font-semibold text-brand-black transition hover:bg-brand-gold-light"
  cta-glass-dark:  "rounded-md border border-white/25 bg-white/5 px-5 py-3 text-sm font-semibold text-white backdrop-blur transition hover:border-brand-gold hover:text-brand-gold"
  cta-black:       "rounded-md bg-brand-black px-4 py-2.5 font-semibold text-white hover:bg-brand-charcoal"
  cta-outline:     "rounded-md border border-brand-black/15 px-4 py-2.5 hover:border-brand-gold hover:bg-brand-gold-pale"
  link-gold:       "font-semibold underline decoration-brand-gold decoration-2 underline-offset-4 hover:text-brand-gold-deep"
  button:
    base: "rounded-lg text-sm font-medium transition-all active:translate-y-px disabled:opacity-50"
    variants: { brand: "bg-brand-black text-white hover:bg-brand-charcoal", gold: "bg-brand-gold text-brand-black hover:bg-brand-gold-light", danger: "bg-red-700 text-white hover:bg-red-800", shadcn: [default, outline, secondary, ghost, destructive, link] }
    sizes: { xs: h-6, sm: h-7, default: h-8, lg: h-9, xl: "h-11 gap-2 px-4 text-sm", icon: size-8, icon-xs: size-6, icon-sm: size-7, icon-lg: size-9 }
  input-public:    "mt-2 h-12 w-full rounded-xl border border-brand-black/10 bg-white px-4 text-base text-brand-black placeholder:text-brand-grey-light transition focus:border-brand-gold"
  textarea-public: "mt-2 w-full resize-y rounded-xl border border-brand-black/10 bg-white px-4 py-3 text-base leading-relaxed text-brand-black placeholder:text-brand-grey-light transition focus:border-brand-gold"
  input-search:    "h-12 w-full rounded-full border border-brand-black/10 bg-white pl-12 pr-12 text-base shadow-card placeholder:text-brand-grey focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/30"
  select-native:   "min-h-11 rounded-md border border-brand-black/15 bg-white px-3 text-sm text-brand-black"
  input-shadcn:    "h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base"   # admin
  label:           "text-sm font-semibold text-brand-black"
  choice-option:   { base: "flex h-12 items-center justify-center rounded-xl border px-4 text-base font-semibold transition", on: "border-brand-gold bg-brand-gold-pale text-brand-black ring-2 ring-brand-gold/50", off: "border-brand-black/10 bg-white text-brand-charcoal hover:border-brand-gold/60" }
  segmented-pill:  { base: "inline-flex min-h-11 items-center rounded-full px-3 py-1.5 text-sm font-semibold transition", on: "bg-brand-black text-white", off: "bg-white text-brand-charcoal ring-1 ring-brand-black/10 hover:ring-brand-gold/60" }
  nav-item:        "relative rounded-md px-3 py-2 text-sm font-medium text-white/80 hover:bg-white/5 hover:text-white; after: absolute inset-x-3 -bottom-[13px] h-0.5 rounded-full bg-brand-gold opacity-0"
  nav-item-active: "text-brand-gold after:opacity-100"
  crest-tile:      "flex h-11 w-11 items-center justify-center rounded-md bg-white p-1 ring-1 ring-white/20 group-hover:ring-brand-gold"   # footer h-12 w-12
  date-tile:
    md: { box: "w-16 rounded-xl bg-brand-gold-pale py-2.5 ring-1 ring-brand-gold/30", day: "display text-3xl text-brand-black", month: "mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-gold-deep" }
    sm: { box: "w-12 rounded-lg bg-brand-stone py-1.5 ring-1 ring-brand-black/5", day: "display text-xl text-brand-black", month: "mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-grey" }
  data-table:
    wrapper: card-static
    header-row: "border-brand-black/10 hover:bg-transparent; th text-brand-grey"
    row: "border-brand-black/5 hover:bg-brand-stone/60"
    club-row: "bg-brand-gold-pale font-semibold hover:bg-brand-gold-pale"
    cell: "text-brand-charcoal; numeric columns tabular-nums"
    shadcn-base: "w-full caption-bottom text-sm; th h-10 px-2; td p-2"
  sponsor-tiers:
    Platinum: { grid: "grid-cols-1 sm:grid-cols-2", logo: "h-28 sm:h-36", card: "p-10 rounded-3xl", badge: "bg-brand-black text-white" }
    Gold:     { grid: "grid-cols-2 md:grid-cols-3", logo: "h-20 sm:h-24", card: "p-8 rounded-2xl", badge: "bg-brand-gold text-brand-black" }
    Silver:   { grid: "grid-cols-2 md:grid-cols-4", logo: "h-14 sm:h-16", card: "p-6 rounded-xl", badge: "bg-brand-stone text-brand-black ring-1 ring-brand-black/10" }
    Bronze:   { grid: "grid-cols-2 sm:grid-cols-3 md:grid-cols-6", logo: "h-10 sm:h-12", card: "p-4 rounded-lg", badge: "bg-brand-gold-pale text-brand-gold-deep" }
    Player:   { grid: "grid-cols-2 sm:grid-cols-3 md:grid-cols-6", logo: "h-10 sm:h-12", card: "p-4 rounded-lg", badge: "bg-brand-ink text-white" }
    card-base: "flex items-center justify-center bg-white shadow-card ring-1 ring-brand-black/5 transition; linked: hover:-translate-y-0.5 hover:shadow-card-hover hover:ring-brand-gold/60"
    strip-logo-heights: { Platinum: "h-16 sm:h-20", Gold: "h-12 sm:h-14", other: "h-9 sm:h-10" }
---

# Lang Lang Cricket Club: Design System

This document records the visual system that is live on langlangcricketclub.com as of 2026-10-03. It is also the theming contract for future club sites built from this codebase after the Payload CMS migration. The front-matter holds exact class strings and values. The prose explains intent, records inconsistencies, and marks which parts are club brand and which are template structure.

**Conventions.** Every value comes from the code. Where something is uncertain or inconsistent it is marked **[ambiguous]** or **[inconsistent]**. Claims taken from the extraction map that were not re-verified for this document are marked **[unverified]**.

---

## 1. Overview and brand personality

The site reads as a **local sporting club with a premium edge**. Large black bands with a single warm gold accent come from the club's crest colours. The headlines use a condensed, uppercase athletic face (Barlow Condensed), and the body text is a calm, neutral sans (Inter). The page alternates between bright reading surfaces (white, cream, stone) and dark brand bands (nav, page headers, hero, CTA panels, footer).

Personality:
- **Community first.** The copy and imagery are warm and plain, and the site is organised around people, events and sponsors.
- **Athletic and confident.** The display type is big and uppercase, with gold highlights on key phrases.
- **Restrained.** There is one accent hue and its tints, with no second brand colour. Depth comes from soft, black-tinted shadows and thin rings, never from borders or heavy chrome.
- **Light theme only.** The dark sections are deliberate bands. There is no dark mode.

## 2. Colours

### 2.1 Palette and semantic roles

| Token | Hex | Semantic role | Typical use |
|---|---|---|---|
| `brand-black` | `#0B0B0D` | Main dark surface, strongest text | Nav, PageHeader, hero, footer, CTA panels, headings, `brand` button |
| `brand-ink` | `#17171A` | Raised dark surface | Mobile menu, Clubhouse dropdown, gallery tile background, Player tier badge |
| `brand-charcoal` | `#26262B` | Body text on light, dark hover | `.story-content`, table cells, hover for black buttons |
| `brand-gold` | `#F5B700` | Accent | Primary CTAs, active nav, eyebrows on dark, focus ring, selection, announcement strip |
| `brand-gold-dark` | `#C99400` | Accent, strong end | Start of the gradient rule only |
| `brand-gold-light` | `#FFD966` | Accent hover, accent on dark | Hover for gold buttons, end of the gradient rule, role labels on dark |
| `brand-gold-pale` | `#FFF4CC` | Accent tint surface | Icon chips, callouts, DateTile md, the club's ladder row, count pills, selected choice |
| `brand-gold-deep` | `#8A6500` | Accent text on light | Eyebrows on light, small gold text, icon colour on light |
| `brand-cream` | `#FAF7EF` | Alternate section band | Committee section, sponsor marquee band, contact map, fixtures filter bar |
| `brand-stone` | `#F3F1EA` | Muted surface | Tinted cards, empty states, image placeholders, admin background |
| `brand-grey` | `#5A5A62` | Muted text | Intros, body, table headers |
| `brand-grey-light` | `#6E6E76` | Subtle text | Captions, placeholders, empty-state text |

Opacity modifiers do much of the work (front-matter `opacity-conventions`). On light surfaces, `brand-black/5`, `/10` and `/15` give the ring, divider and outline steps, and `brand-gold/30`, `/40` and `/60` give the chip ring and the two hover-ring strengths. On dark surfaces, `white/5`, `/10`, `/25` and `/60`–`/80` play the same parts.

### 2.2 Status colours

There are **no success or warning tokens**. Errors use stock Tailwind red: `text-red-700` (28 uses), `bg-red-50`, `ring-red-200`, `text-red-800`, and the `danger` Button `bg-red-700`/`hover:bg-red-800`. The single other non-brand colour is `text-rose-500`, used for the heart in the footer credit. Positive feedback, such as the RSVP tally, uses the brand gold (`bg-brand-gold` bar on a `bg-brand-black/10` track).

### 2.3 shadcn semantic variables: [inconsistent]

`app/globals.css :root` holds the stock shadcn neutral oklch set (`--primary oklch(0.205 0 0)`, `--ring oklch(0.708 0 0)`, `--border oklch(0.922 0 0)`, `--destructive oklch(0.577 0.245 27.325)` and so on, plus chart and sidebar variables). **None of them map to the brand.** They only show in `components/ui/*`: the default, outline and ghost Buttons, the shadcn Input and Card, the Dialog, and the base hover of Table rows. As a result the admin primitives look neutral grey next to the brand. A `.dark` block exists but is never activated.

### 2.4 Hard-coded colour leaks

These bypass the token system and have to be included when re-theming:
- `globals.css`: `* { outline-color: #f5b700 }`, `:focus-visible { outline: 2px solid #f5b700 }`, `::selection { background: #f5b700; color: #0b0b0d }`.
- `components/events/event-placeholder-art.tsx`: `GOLD = ['#F5B700','#C99400','#FFD966']` and `#0B0B0D` literals.
- Shadow rgba values use `rgba(11,11,13,…)`, which is brand-black hard-coded into `boxShadow`.

## 3. Typography

| Role | Family | Weights loaded | Applied via |
|---|---|---|---|
| Body / UI | **Inter** | 400, 500, 600, 700 | `--font-body` and `font-sans` (applied to `html`) |
| Display / headings | **Barlow Condensed** | 500, 600, 700 | `--font-heading` and `font-heading`, mostly through `.display` |

Both are loaded with `next/font/google` (`subsets: ['latin']`, `display: 'swap'`). The fallback for both is `system-ui, sans-serif`.

**Two type utilities carry the identity:**
- `.display` (`font-heading font-bold uppercase leading-none tracking-wide`) is used for every hero, page and section title, the wordmark, footer column headings, DateTile numerals and initials fallbacks.
- `.eyebrow` (`text-xs font-semibold uppercase tracking-[0.18em] text-brand-gold-deep`) sits above most section titles. On dark backgrounds it changes to `text-brand-gold`.

**Scale.** The full set of class strings is in the front-matter `typography.scale`. The heading ladder is 8xl (hero), 7xl (page), 5xl (section), 2xl (sub-section and panel), and xl/lg (cards). It reaches full size at `lg`, and steps up at `sm` and `lg`.

**Mixed-case headings.** Card titles (`font-heading text-xl font-bold leading-tight tracking-tight`) use Barlow in mixed case, not `.display`. Highlight-card and committee-card titles use **Inter** bold. **[inconsistent]** There are three card-title treatments: Barlow mixed case for events and stories, Barlow `text-base` for player names, and Inter bold for highlights and committee members.

**Long-form.** `.story-content` is a deliberately neutral reading surface. It uses Inter at 17px with 1.75 line height in charcoal, `h2 text-2xl` and `h3 text-xl` in Inter semibold (not display), and blockquotes with `border-l-2 border-brand-black/15`. Images run full-bleed on mobile and `rounded-xl` from `sm`.

**Bug.** `.story-title-input` uses `font-serif` (`globals.css:260`). No serif font is loaded, so it falls back to the browser serif stack.

## 4. Layout and spacing

- **One container.** `.container-site` is `max-w-6xl` (1152px) with a 20px gutter, rising to 32px from `sm`. It is used everywhere, including the admin.
- **Breakpoints.** These are the Tailwind defaults. The layout is effectively mobile, then `sm` (640), then `lg` (1024). `md` and `xl` are rare. The desktop nav appears at `lg`.
- **Vertical rhythm.** Home sections use `py-20 lg:py-28`, inner sections `py-16 lg:py-24` or `py-12 lg:py-16`, and the PageHeader `py-16 sm:py-20 lg:py-24`. The footer sits `mt-24` below content. Heading-to-content spacing is `mt-10` or `mt-12`.
- **Section alternation.** The order is white, cream, white, black, with rounded-3xl black CTA panels as punctuation.
- **List grids.** Events and stories use `sm:grid-cols-2 lg:grid-cols-3`. Committee uses `sm:grid-cols-2 lg:grid-cols-4`. Gallery and players use `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`.
- **Asymmetric detail grids.** These all have a sticky side column: history `lg:grid-cols-[1fr_1.2fr]` (image `lg:sticky lg:top-28`), contact `[1fr_1.4fr]`, documents `[280px_1fr]`, event detail `[5fr_7fr]` (aside sticky `top-24`).
- **Overlap.** On the contact page the card row pulls up into the header with `relative z-10 -mt-8`.

## 5. Elevation and shape

- **Shadows.** There are exactly two, `shadow-card` and `shadow-card-hover`, both tinted with brand-black. They are always paired with `ring-1 ring-brand-black/5`. Interactive cards swap to the hover shadow, lift `-translate-y-0.5`, and tint the ring to `brand-gold/40`.
- **Radius.** `--radius` is `0.625rem`, and `tailwind.config.ts` redefines `rounded-lg`, `rounded-md` and `rounded-sm` from it as **10px, 8px and 6px**. `xl`, `2xl`, `3xl` and `full` keep the Tailwind values (12px, 16px, 24px, 9999px). Usage tiers:
  - `rounded-2xl`: standard card
  - `rounded-3xl`: hero-scale panels
  - `rounded-xl`: tiles, inputs, empty states
  - `rounded-lg`: icon chips, the Button component
  - `rounded-md`: hand-written CTAs, nav items, crest tile
  - `rounded-full`: pills and avatars
- **[inconsistent]** The Button component is `rounded-lg` (10px), but every hand-written CTA is `rounded-md` (8px). A gold `<Button>` next to a hand-written gold link has a visibly different corner.
- **Decorative depth on dark.** The site adds depth to dark surfaces in two ways:
  - A 4px gold **gradient rule** (`from-brand-gold-dark via-brand-gold to-brand-gold-light`) across the top of the nav, the footer and the admin nav.
  - Blurred **glow orbs** (`h-72 w-72 rounded-full bg-brand-gold/10–/20 blur-3xl`) in the PageHeader (at `-right-24 -top-24` and `-bottom-32 left-1/3`) and in the CTA panels.

## 6. Components

### 6.1 Buttons and links
The CVA `Button` (`components/ui/button.tsx`) has the shadcn variants plus three brand variants: `brand` (black), `gold` and `danger`. Sizes go from `xs` (h-6) to `xl` (h-11, a 44px tap target). Public pages use `xl` for event-card actions and form submits (`variant="brand" size="xl"`).

**[inconsistent]** Most public CTAs do not use the component. Five hand-written recipes recur, and all are listed verbatim in the front-matter:
1. `cta-gold`: the primary action, on any surface.
2. `cta-glass-dark`: the secondary action on dark or photo backgrounds.
3. `cta-black`: the primary action on light.
4. `cta-outline`: the secondary action on light.
5. `link-gold`: an inline text link with a gold underline. On dark it is plain gold text.

The intended consolidation is Button variants `gold`, `brand`, `outline-light`, `glass-dark` and `link-gold` (proposed; they do not exist yet).

### 6.2 Cards
- **Standard** (`card`): committee, events, stories, documents and admin cards. It has the lift, shadow swap and gold ring on hover.
- **Static** (`card-static`): data tables, scorecards and form cards (`p-6 sm:p-8`).
- **Tinted** (`card-tinted`): the home highlight cards. Stone changes to gold-pale on hover.
- **Callout** (`callout`): gold-pale with a `gold/30` ring.
- **Empty state** (`empty-state`): a stone tile with centred subtle text. PlayHQ "unavailable" uses `rounded-2xl` and its own title and body copy.
- **[inconsistent]** The PlayerCard hovers with only the shadow swap and a `scale-[1.02]` image, with no lift or gold ring. Other cards lift and use `scale-105`.

### 6.3 Inputs and forms
There are four input recipes **[inconsistent]**:
- `input-public` / `textarea-public` (h-12, rounded-xl, focus border gold). This is the **de-facto public standard**, but the constant is copy-pasted in three files: `rsvp-form.tsx`, `rsvp-edit-form.tsx` and `photo-submit-form.tsx`.
- `input-search`: the players directory search. It is a rounded-full pill with shadow-card and a `ring-2 ring-brand-gold/30` focus ring.
- `select-native`: the season picker (min-h-11, rounded-md).
- `input-shadcn`: the admin (h-8, rounded-lg, neutral `border-input`).

Labels are `text-sm font-semibold text-brand-black`, and help text is `text-sm text-brand-grey`. Radio choices render as large tiles (`choice-option`): gold-pale with a gold ring when selected. The submit row is `border-t border-brand-black/10 pt-6`, right-aligned from `sm`. Errors use `error-box`.

**[unverified]** The extraction map says several `components/ui/*` classes (`ring-3`, `in-data-[slot=…]`, `not-aria-[haspopup]`, `data-open:`, `supports-backdrop-filter:`, `backdrop-blur-xs`, `field-sizing-content`) are Tailwind v4 syntax and may compile to nothing on Tailwind 3.4. A build check is needed.

### 6.4 Navigation (`components/site-nav.tsx`)
- **Bar.** Sticky, `z-40`, `bg-brand-black/95 backdrop-blur` (`/85` when backdrop-filter is supported), with a `border-b border-white/10` and the gradient rule on top.
- **Brand lockup.**
  - The crest sits in a white `rounded-md` tile, 44px in the nav. Its ring turns gold on hover.
  - Next to it is the wordmark in `display text-xl`.
  - Under the wordmark is an 11px gold uppercase tagline ("Caldermeade, Victoria").
- **Desktop (`lg`).**
  - Four primary links: Fixtures, Events, Players, History.
  - A **Clubhouse** disclosure with five links: Our People, Announcements, Gallery, Sponsors, Documents. It opens a `w-48 rounded-md bg-brand-ink shadow-card-hover` panel.
  - A gold "Get in touch" mail CTA.
  - The active link turns gold and shows a 2px gold underline at `-bottom-[13px]`, which sits on the bar's bottom edge.
- **Mobile.**
  - A 44px toggle opens a `bg-brand-ink` panel.
  - It holds Home plus the primary links, then a small gold "Clubhouse" heading and its links.
  - Rows are `min-h-11`, and the active row has a `border-l-2` gold marker.
  - A full-width gold CTA ends the panel.
- **Admin.** `SiteChrome` hides the nav and footer under `/admin`.

### 6.5 Footer (`components/site-footer.tsx`)
- **Frame.** Black with the gradient rule, `py-14 lg:py-16`.
- **Columns.** The grid is `sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr]`:
  - Brand: a 48px crest tile, the wordmark, the tagline and a `text-sm text-white/70` blurb.
  - **Explore**: two link lists.
  - **Find us**: location, email and Facebook, each with a gold icon.
- **Headings and links.** Column headings use `display text-lg text-brand-gold`. Links are `min-h-9 text-white/80 hover:text-brand-gold`.
- **Bottom bar.** `border-t border-white/10`, `text-xs text-white/60`. It holds the copyright, the funding credit ("Proudly supported by Cardinia Shire Council and Community Bank Lang Lang.") and the agency credit: rose heart, then "sherlabs.com" in `white/90` with a `brand-gold/60` underline.

### 6.6 PageHeader (`components/page-header.tsx`)
The dark banner at the top of every inner page:
- `bg-brand-black` with two glow orbs.
- An eyebrow in gold, then a `display` H1 (`text-5xl sm:text-6xl lg:text-7xl`).
- An optional intro (`text-lg text-white/75 max-w-2xl`).
- A `children` slot, used for example for the documents category pills.

### 6.7 SectionHeading (`components/section-heading.tsx`)
Props are `eyebrow`, `title`, `intro`, `align: left|center` and `tone: light|dark`. The wrapper is `max-w-2xl`, with `mx-auto text-center` when centred. With the dark tone the eyebrow turns gold, the title white and the intro `white/75`.

**Sub-section variant** (inline on the fixtures, events and history pages): a `display text-2xl` H2, then an optional gold-pale `count-pill`, then an `h-px flex-1 bg-brand-black/10` rule that fills the rest of the line.

### 6.8 Data tables (PlayHQ: ladder, fixtures/results, player stats, scorecards)
- **Structure.** Built on the shadcn `Table` (`w-full caption-bottom text-sm`, horizontal scroll wrapper) inside a `card-static`.
- **Header row.** `border-brand-black/10`, no hover, with `text-brand-grey` header cells.
- **Body rows.** `border-brand-black/5 hover:bg-brand-stone/60`. Numeric columns use `tabular-nums`.
- **Club row.** The ladder highlights the club's own row with `bg-brand-gold-pale font-semibold`.
- **Scorecards and stats tables.** Each has a panel header (`border-b border-brand-black/10 px-5 py-4`) with a `display text-2xl` title and, for scorecards, a `text-lg font-bold tabular-nums` total.
- **Game rows.** A `divide-y divide-brand-black/5` list. Links are `font-semibold text-brand-gold-deep hover:underline`, and secondary meta is `text-xs text-brand-grey-light` (stacked on mobile).
- **Accessibility.** Every table has a `sr-only` caption.
- **Filters.** The team switcher uses `segmented-pill` (black when active). The season picker is a labelled native select with `eyebrow` styling on its label.

### 6.9 Sponsor tiers (`components/sponsor-logos.tsx`, `TIER_STYLES`)
- **Tier order.** Platinum, Gold, Silver, Bronze, Player. An unknown tier is shown as Bronze.
- **Tier scaling.** The grid density, logo height, card padding and radius all step down by tier (front-matter `sponsor-tiers`). The radius goes from Platinum `p-10 rounded-3xl` to Bronze and Player `p-4 rounded-lg`.
- **Tier badges.**
  - Platinum: black
  - Gold: gold
  - Silver: stone with a ring
  - Bronze: gold-pale with gold-deep text
  - Player: ink
- **Sponsor cards.** White with `shadow-card`. Only linked cards lift and take a `gold/60` ring on hover. A sponsor with no logo shows its name as `text-sm font-semibold` text.
- **Home strip.** Logo heights are by tier (Platinum `h-16 sm:h-20`, Gold `h-12 sm:h-14`, others `h-9 sm:h-10`).
- **Carousel.** It runs in a `bg-brand-cream py-8 sm:py-10` band with an edge-fade mask. Logos are `h-12 sm:h-16 opacity-85`. It needs at least 4 logos to scroll; fewer show as a static row. Tier blurbs are club copy (§11).

### 6.10 Event date tiles and event cards
- **DateTile `md`** (event cards): a gold-pale calendar leaf with the day in `display text-3xl` and the month as an 11px gold-deep label.
- **DateTile `sm`** (compact lists): a stone leaf with the day in `display text-xl` and the month as a 10px grey label.
- **Event card.**
  - `card` with a `16/10` image, or `EventPlaceholderArt` when there is no image.
  - The image zooms `scale-105` over 300ms.
  - A recurring event gets an `image-badge` with the Repeat icon.
  - The body has the DateTile, a gold-deep meta line with optional `tag-pill`s, and a Barlow mixed-case title.
  - Time and location rows use gold-deep icons, and the description is clamped to 3 lines.
  - The footer row has `xl` `brand` and `gold` Buttons.
- **EventPlaceholderArt.** Seeded by event id, it picks one of three SVG compositions (rings, bands, dot lattice) and draws a gold radial glow on black.
- **RSVP tally.** An `h-2 rounded-full` track in `brand-black/10` with a `brand-gold` fill.

### 6.11 Player and people cards
- **PlayerCard.**
  - `rounded-2xl` white card with a square photo on a stone background.
  - Fallback initials are `display text-5xl text-brand-grey-light`.
  - A gold-deep uppercase meta label, then the name in `font-heading text-base font-bold`, then a one-line `text-xs` grey detail.
- **CommitteeCards.**
  - Square photo on gold-pale, with fallback initials in `font-heading text-5xl font-bold text-brand-gold-deep/70`.
  - The caption overlay is a `bg-gradient-to-t from-brand-black/95 via-brand-black/55 via-55% to-transparent` gradient.
  - On the overlay, the role is an 11px `text-brand-gold-light` label and the name is `text-lg font-bold` Inter in white.
  - Phone and email rows are `min-h-9`, with `h-3.5` gold-deep icons.
- **[inconsistent]** There are two initials-fallback treatments: grey on stone (players) and gold-deep/70 on gold-pale (committee).

### 6.12 Other
- **AnnouncementBanner.**
  - A full-width `bg-brand-gold text-brand-black` strip above the hero, with `border-b border-brand-black/10`.
  - A 32px black circular chip with a gold megaphone icon.
  - An 11px `tracking-[0.18em]` label, then the bold title and an excerpt cut to 140 characters.
  - A dismiss button **[unverified: 40px per the extraction map]**. Dismissal is stored in the `llcc_ann_dismissed` cookie.
- **Dialog / lightbox.** The Dialog overlay is `bg-brand-black/50`. The gallery lightbox is `bg-brand-black/95 backdrop-blur-sm`.
- **Icon chip.** 40px (or 44px), `rounded-lg`. It goes from gold-pale with gold-deep to gold with black on group hover.

## 7. Imagery and iconography

- **Crest.** `/assets/branding/logo.png` always sits in a **white rounded tile** (`bg-white p-1 ring-1 ring-white/20`): 44px in the nav, 48px in the footer, and a 28px circle in the hero pill. It never appears bare on black.
- **Hero.**
  - `/assets/branding/hero.jpg`, `object-cover object-[center_60%]`, `min-h-[560px] sm:min-h-[640px] lg:min-h-[700px]`.
  - Two overlays: `bg-gradient-to-r from-brand-black/90 via-brand-black/60 to-brand-black/20` and `bg-gradient-to-t from-brand-black/80 via-transparent to-transparent`.
  - Content is bottom-aligned (`justify-end pb-16 sm:pb-24`) and led by a glass pill (`rounded-full bg-white/10 backdrop-blur`) holding the crest.
- **Aspect ratios.**
  - Event card `16/10`
  - Event detail `16/9`
  - Story card `aspect-video`
  - History feature `3/2`
  - People, players and gallery `square`
  - The home gallery teaser's first tile spans `col-span-2 row-span-2`.
- **Photo hover.** `scale-105` over 300–500ms. Gallery tiles reveal a gradient caption and a maximise chip on hover or focus.
- **OG image.** `/og-image.jpg`, 1200×630.
- **Icons.**
  - Library: Hugeicons (free set) only, as `<HugeiconsIcon icon={X} className="h-4 w-4" aria-hidden />`.
  - Sizes: `h-4` inline, `h-5` in toggles and chips, `h-6` in contact cards, `h-3`/`h-3.5` in badges and meta rows.
  - Icon colour is `text-brand-gold-deep` on light and `text-brand-gold` on dark.
  - The only custom icon is `FacebookIcon` (`components/icons.tsx`, `currentColor`).
  - `components.json` declares `"iconLibrary": "lucide"`, which is wrong; lucide is not installed.

## 8. Motion

- **Defaults.** Every bare `transition` uses 200ms with `cubic-bezier(0.22, 1, 0.36, 1)` (ease-out-quint), set in `tailwind.config.ts`.
- **Vocabulary.**
  - Card lift (`-translate-y-0.5`) with the shadow swap.
  - Image zoom (`scale-105`, 300 or 500ms).
  - Chevron `rotate-180` on the Clubhouse disclosure.
  - Menu and lightbox entry with `animate-in fade-in-0 slide-in-from-top-*`.
  - Button press `active:translate-y-px`.
  - RSVP bar `transition-[width] duration-300`.
- **Marquee.** `@keyframes sponsor-marquee` runs on two copies of the logo row. It pauses on hover or focus-within, and its duration is `max(24, n*5)s`.
- **Reduced motion.** Handled **only** for the marquee, which becomes a wrapped static row with the duplicate hidden. There are **zero** `motion-reduce:` or `motion-safe:` utilities in `app/` or `components/`, so the hover lifts and zooms always run.

## 9. Page patterns

- **Home** (`app/page.tsx`), in order:
  1. AnnouncementBanner
  2. Hero (H1 with the last phrase in `text-brand-gold`, a `cta-gold` mail CTA and a `cta-glass-dark` "Meet the committee")
  3. SponsorCarousel
  4. About (`lg:grid-cols-[1.1fr_1fr]`: SectionHeading and two CTAs, next to a 2×2 grid of `card-tinted` highlights with icon chips)
  5. Dark gallery teaser (six photos)
  6. Cream committee section
  7. Centred sponsors strip
  8. A `rounded-3xl bg-brand-black` Join CTA panel with a glow orb, gold eyebrow, display H2 and a `cta-gold` email button
- **Listing** (events, stories, gallery, players, sponsors, documents, people): a PageHeader, then `container-site` sections. Groups get the sub-section heading (title, count pill, rule). Content sits in responsive card grids. Empty groups use `empty-state`.
- **Detail** (event, story, history):
  - A PageHeader or hero image, then an asymmetric two-column grid with a sticky side column (§4).
  - Long-form text uses `.story-content`.
  - Asides use `card-static` or `callout`.
  - History has a pull quote (`border-l-4 border-brand-gold`).
- **Forms** (RSVP, RSVP edit, photo submit, story submit):
  - A single `card-static` (`p-6 sm:p-8`) with a `display text-2xl` title, then `gap-5` fields using `input-public`.
  - Choice tiles for enumerated answers, then a bordered submit row with a `brand` `xl` Button and a gold-deep secondary text link.
  - Errors in `error-box` above the actions.
- **Contact.** The header is overlapped by a `sm:grid-cols-3` card row (first card gold, the others white), followed by a map on cream.
- **Error / 404.** `app/error.tsx` is a centred `rounded-2xl bg-brand-stone p-10` card. **There is no `not-found.tsx`.** `notFound()` falls back to the Next.js default page, which has no branding.
- **Admin.** A `bg-brand-stone` page, a black sticky AdminNav with the gradient rule and the "Lang Lang CC / Admin" wordmark, and `container-site py-10 sm:py-12`.

## 10. Voice and tone

- Australian English (`lang="en-AU"`, locale `en_AU`, timezone `Australia/Melbourne`). The tone is warm, plain and community first: "room for every player", "Everyone gets a game".
- First-person plural ("We are a club built by volunteers and families"). It is concrete and local, naming funders (Cardinia Shire Council, Community Bank Lang Lang) and the safeguarding framework.
- Display headlines are short and often split into two clauses, with a gold-highlighted phrase: "Play your cricket **with Lang Lang**", "Local cricket, played the right way.", "Keen to play, coach or volunteer?" Headlines end in punctuation only when they are full sentences.
- Eyebrows are two or three words ("About the club", "Around the club", "Join us").
- CTAs start with a verb and stay casual: "Get in touch", "Meet the committee", "Write your story", "View the full gallery".
- Empty states are friendly and forward-looking: "Committee details will be published soon.", "Player records are on their way."

## 11. Accessibility

**In place**
- A global gold focus ring (`:focus-visible { outline: 2px solid #f5b700; outline-offset: 3px; border-radius: .25rem }`).
- `brand-gold-deep` exists so that small gold text passes contrast.
- 44px tap targets for primary controls (`min-h-11`, `h-11 w-11`, Button `xl`). Footer and contact link rows are 36px (`min-h-9`).
- The nav uses `aria-current="page"` and `aria-expanded`/`aria-controls`. The Clubhouse menu closes on Escape, outside click and focus-out.
- `sr-only` "(opens in a new tab)" text and table captions, `alt=""`/`aria-hidden` on decorative images, and the marquee duplicate `aria-hidden` with `tabIndex=-1`. The page sets `lang="en-AU"`.

**Computed contrast (WCAG 2.x)**

| Pair | Ratio | Verdict |
|---|---|---|
| `brand-gold` focus ring on white | 1.8:1 | **Fails** the 3:1 non-text minimum on light surfaces. It passes on black (10.91:1). |
| `brand-gold-deep` on white / gold-pale / stone | 5.33 / 4.84 / 4.71:1 | Passes AA for body text |
| `brand-grey` on white / cream | 6.83 / 6.38:1 | Passes |
| `brand-grey-light` on white | 5.05:1 | Passes |
| `brand-grey-light` on `brand-stone` (the `empty-state` recipe) | **4.47:1** | **Fails AA by a hair** at `text-sm` |
| `white/60` on `brand-black` (footer bottom bar) | 7.29:1 | Passes (the extraction map called this "borderline"; it is not) |
| `white/50` on `brand-black` | 5.33:1 | Passes |
| `brand-black` on `brand-gold` | 10.91:1 | Passes |

**Missing**
- No skip-to-content link.
- No `<main>` landmark in the root layout; each page adds its own.
- Hover motion is not gated by reduced-motion preferences.
- No branded 404.

## 12. Do's and don'ts

**Do**
- Use `.display` for titles and `.eyebrow` above section titles. Keep display text uppercase and short.
- Put the crest on a white tile. Use gold as the single accent and pull gold text on light surfaces from `brand-gold-deep`.
- Pair `shadow-card` with `ring-1 ring-brand-black/5`. Hover states lift, swap the shadow and tint the ring gold.
- Alternate light and dark bands, and close long pages with a dark rounded-3xl CTA panel.
- Keep tap targets at 44px and give every Hugeicons icon `aria-hidden`.
- Use `container-site` for every horizontal constraint.

**Don't**
- Use Tailwind default greys (`gray-*`, `zinc-*`); use `brand-grey` and `brand-grey-light`. The comment at `tailwind.config.ts:24` says so explicitly.
- Use `brand-gold` for text on white or cream, because it fails contrast.
- Add a second accent hue, heavy borders or drop shadows that are not black-tinted.
- Hand-write a new CTA class string. Use (or add) a Button variant.
- Add hex literals outside the token system, as the focus ring, selection and placeholder art already do.
- Introduce new icon libraries.

---

## 13. Theming for other clubs

### 13.1 Club brand (swap per club) vs structural (keep)

| Item | Current value / location | Class | Where it should live |
|---|---|---|---|
| Accent hue family (gold, gold-dark, gold-light, gold-pale, gold-deep) | `tailwind.config.ts` hex | **Club** | `theme` global: one accent colour, with tints entered or derived (gold-deep must be contrast-checked against white and the pale tint, ≥4.5:1) |
| Dark surfaces (black, ink, charcoal) | hex | **Club** (most clubs keep near-black) | `theme` global |
| Light neutrals (cream, stone, grey, grey-light) | hex | **Club, optional**: warm neutrals tuned to gold; a blue club may want cooler ones | `theme` global with defaults |
| Focus and selection colours | `globals.css` hex literals | **Club** (derived from the accent) | CSS variables |
| Placeholder-art palette | `event-placeholder-art.tsx` `GOLD` array | **Club** (derived from the accent) | Read CSS variables or theme props |
| Shadow tint `rgba(11,11,13,…)` | `tailwind.config.ts` boxShadow | **Club** (follows the dark surface) | CSS variable in rgb channels |
| Heading font | Barlow Condensed 500–700 | **Club, from a curated list**. `next/font` is build-time, so offer a fixed set of pre-bundled pairs and pick one with a setting, not free text. | `theme.fontPair` select |
| Body font | Inter 400–700 | Structural default; part of the font pair | Same select |
| Crest / logo | `/assets/branding/logo.png` (nav, footer, hero pill, admin login, JSON-LD) | **Club** | `club.logo` upload (keep the white-tile treatment) |
| Hero image and focal point | `/assets/branding/hero.jpg`, `object-[center_60%]` | **Club** | `homePage.hero.image` (Payload focal point) |
| OG image, favicon, apple-touch-icon | `/og-image.jpg` and others | **Club** | `club` global uploads |
| Club name, short name, tagline/location | "Lang Lang Cricket Club", "Lang Lang CC", "Caldermeade, Victoria" (36 files per the extraction map) | **Club** | `club` global |
| Email, socials | `langlangcricketclub@gmail.com` (5 files); Facebook as text only, with no URL | **Club** | `club.email`, `club.socials[]` (and JSON-LD `sameAs`) |
| Funding credit | footer line | **Club** | `club.supportedBy` |
| Site URL and hosts | `lib/site-metadata.ts`, `next.config.mjs` www/vercel.app redirects | **Club** (deployment) | env, plus `club.siteUrl` |
| Locale and timezone | `en-AU`, `en_AU`, `Australia/Melbourne` | **Club** | `club.locale`, `club.timezone` |
| Cookie prefix | `llcc_` (`llcc_rsvps`, `llcc_ann_dismissed`, `llcc_story_draft`, `llcc_admin_session`) | **Club** (keep the names for Lang Lang so existing visitors' saved state is not reset) | env or config constant |
| All copy (hero headline and gold phrase, highlights, About, CTA, tier blurbs, page headers, empty states, history narrative) | `app/**` | **Club** | Page globals / blocks |
| Navigation (primary vs "Clubhouse" group, footer columns) | `site-nav.tsx`, `site-footer.tsx` (duplicated) | **Club** | `navigation` global (header + footer arrays) |
| Sport vocabulary and config: sponsor tiers incl. `Player`, people sections, document categories, JSON-LD `sport: 'Cricket'`, PlayHQ fixtures and ladder, Players directory | various | **Club / sport** (feature flags + select options) | `siteSettings` (feature flags, `sponsorCarouselTiers`) + `club.sport` |
| Agency credit (sherlabs.com) | footer | **Template**, but `utm_source` must come from the club's domain | Template constant |
| `.display`, `.eyebrow`, `.container-site`, type scale | `globals.css` | **Structural** | Keep |
| Radius scale, shadow pair geometry, ring/opacity conventions, section rhythm | config/classes | **Structural** | Keep |
| Card, callout, empty-state, form, table and pill recipes; sponsor tier scaling | components | **Structural** | Keep (they re-colour through tokens) |
| Gradient rule, glow orbs, hero dual overlay | classes | **Structural** (they follow the accent and dark-surface tokens automatically) | Keep |
| PageHeader, SectionHeading, DateTile, CommitteeCards, PlayerCard, marquee, AnnouncementBanner, nav disclosure behaviour | components | **Structural** | Keep |
| Motion defaults, focus and tap-target rules, Hugeicons conventions | config | **Structural** | Keep |

### 13.2 Proposed token mapping (CSS variables)

**Proposed, not implemented.** The 12 `brand.*` keys become CSS variables in rgb channel form. Tailwind keeps the current names, so no markup changes, and `/opacity` modifiers keep working:

```css
/* app/(frontend)/globals.css, emitted at request time from the Payload theme global */
:root {
  --brand-black: 11 11 13;      /* #0B0B0D  role: surface-dark / text-strong */
  --brand-ink: 23 23 26;        /* #17171A  role: surface-dark-raised */
  --brand-charcoal: 38 38 43;   /* #26262B  role: text-body */
  --brand-gold: 245 183 0;      /* #F5B700  role: accent */
  --brand-gold-dark: 201 148 0; /* #C99400  role: accent-strong */
  --brand-gold-light: 255 217 102; /* #FFD966 role: accent-hover */
  --brand-gold-pale: 255 244 204;  /* #FFF4CC role: accent-tint */
  --brand-gold-deep: 138 101 0; /* #8A6500  role: accent-text */
  --brand-cream: 250 247 239;   /* #FAF7EF  role: surface-alt */
  --brand-stone: 243 241 234;   /* #F3F1EA  role: surface-muted */
  --brand-grey: 90 90 98;       /* #5A5A62  role: text-muted */
  --brand-grey-light: 110 110 118; /* #6E6E76 role: text-subtle */
}
/* tailwind: brand.gold = "rgb(var(--brand-gold) / <alpha-value>)", and so on */
```

Follow-ups this enables:
- Point the shadcn `--primary`, `--ring`, `--border` and `--input` variables at the brand variables, so `components/ui/*` stop rendering neutral grey.
- Replace the hex literals in `globals.css` with `rgb(var(--brand-gold))`.
- Have the placeholder art read `var(--brand-*)`.
- Build the shadows from `rgb(var(--brand-black) / .04)`.
- The role names in the comments (`accent`, `accent-text`, `surface-alt`…) are candidate aliases for the template. **[ambiguous]** It is undecided whether to rename the Tailwind keys or keep the `brand-*` names as aliases. Keeping `brand-*` avoids touching 900+ class usages.

### 13.3 Proposed Payload globals

**Proposed.** The `site_settings` table today holds only `sponsorCarouselTiers`.

| Global | Fields (design-relevant) |
|---|---|
| `club` | `name`, `shortName`, `tagline`, `location`, `email`, `socials[] {platform, url}`, `supportedBy`, `siteUrl`, `locale`, `timezone`, `sport`, `logo` (upload), `ogImage`, `favicon` |
| `theme` (or a `theme` group inside `club`) | `colors` group: the 12 tokens above as hex text with validation. Optionally an "accent only" mode that derives dark/light/pale/deep and **checks the derived gold-deep against white and the pale tint (≥4.5:1)**. Also `fontPair` (select over pre-bundled `next/font` pairs; default `barlow-condensed+inter`) and `heroOverlayStrength` (**[ambiguous]**, not in the current code; omit unless needed). |
| `siteSettings` | `sponsorCarouselTiers` (hasMany select; `[]` hides the carousel), feature flags (`playhq`, `players`, `history`, `events`), sponsor tier labels/blurbs, people section labels, document categories |
| `navigation` | `header.primary[]`, `header.groupLabel` ("Clubhouse"), `header.group[]`, `footer.columns[]` |
| `homePage` | hero image, title, highlighted phrase, intro, CTAs, `highlights[] {icon (Hugeicons whitelist select), title, body}`, section headings/intros, join CTA |

The frontend layout reads `club` and `theme` once per request (cached), prints the `:root` variable block in an inline `<style>`, and chooses the `next/font` pair by key. Everything listed as **Structural** above stays in code.

### 13.4 Known inconsistencies to resolve during the migration
1. Hand-written CTAs (`rounded-md`, 8px) vs the Button component (`rounded-lg`, 10px). Collapse them into variants.
2. Four input recipes, with the public one copy-pasted three times. Promote it to `Input`/`Textarea` variants.
3. shadcn variables are neutral and the `.dark` block is unused. Brand-map the variables and delete the `.dark` block.
4. The focus ring fails 3:1 on light surfaces. Use gold-deep or a black offset ring on light.
5. `empty-state` text contrast is 4.47:1. Use `brand-grey` on stone.
6. There are three card-title treatments and two initials-fallback treatments. Pick one of each.
7. The PlayerCard hover differs from the standard card.
8. `.story-title-input` uses `font-serif`, but no serif font is loaded.
9. `components.json` declares `iconLibrary: "lucide"`, but the site uses Hugeicons.
10. There is no `not-found.tsx` and no reduced-motion handling beyond the marquee.
11. **[unverified]** Tailwind v4-only classes in `components/ui/*` may compile to nothing on Tailwind 3.4.
