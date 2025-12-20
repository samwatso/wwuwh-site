# West Wickham Underwater Hockey Club — Theme Tokens (v1)

This file defines the visual theme for the WWUWH static site. Use it as the single source of truth for colours, typography, glass styling, and UI motifs.  
Place in repo root alongside `index.html` and `styles.css`.

---

## Typography

### Display / Headings
- Font file: `assets/fonts/Azonix.otf`
- CSS font-family token: `"Azonix", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`
- Intended use:
  - Hero title (H1)
  - Section headings (H2/H3)
  - Short labels (e.g. day chips, small UI labels)
- Styling guidance:
  - Uppercase for hero + section titles
  - Letter spacing: `0.04em` for large headings, `0.08em` for small labels
  - Hero readability: `text-shadow: 0 8px 24px rgba(0,0,0,0.35)`

### Body / UI
- Font file: `assets/fonts/Nexa Light.otf`
- CSS font-family token: `"Nexa Light", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`
- Intended use:
  - Body copy, navigation, buttons, addresses, captions
- Sizing guidance:
  - Body: 16–18px mobile, 18–20px desktop
  - Line-height: 1.6–1.75 for readability

---

## Primary Colour Palette (Provided)

### DARK BLUE (Primary Navy)
- Token: `--color-navy`
- HEX: `#1e2b60`
- RGB: `32, 44, 96`
- CMYK: `C100 M93 Y31 K26`
- Use for: primary UI, nav tint, headings, icons, dark wave dividers

### WATER BLUE (Accent)
- Token: `--color-water`
- HEX: `#5ab9e7`
- RGB: `115, 183, 227`
- Use for: accents, highlights, hover/focus, subtle glow, secondary UI

---

## Logo-Derived Extensions (Suggested)

These are derived from the logo’s layered look (deep navy shadows + lighter aqua highlights). Adjust if you sample exact values later.

### DEEP NAVY (Shadow / depth)
- Token: `--color-deep-navy`
- HEX: `#0f1733`
- Use for: hero overlay, footer, dark backgrounds, depth shadows

### MID NAVY (Secondary tone)
- Token: `--color-mid-navy`
- HEX: `#243a7a`
- Use for: secondary buttons, borders, card strokes, subhead accents

### ICE BLUE (Soft background tint)
- Token: `--color-ice`
- HEX: `#dff3ff`
- Use for: light backgrounds, gentle section fills, light wave dividers

### INK BLACK (Near-black)
- Token: `--color-ink`
- HEX: `#070a12`
- Use for: deepest shadows, high-contrast overlays (sparingly)

### Neutrals
- Token: `--color-white`  HEX: `#ffffff`
- Token: `--grey-100`     HEX: `#f5f7fb`
- Token: `--grey-300`     HEX: `#d7dce8`
- Token: `--grey-700`     HEX: `#2b2f3a`

---

## Signature Brand Gradient (Wordmark-inspired)

Mirrors the WEST/WICKHAM two-tone split.
- Name: `WESTWICKHAM_GRADIENT`
- CSS: `linear-gradient(90deg, #5ab9e7 0%, #5ab9e7 45%, #1e2b60 55%, #1e2b60 100%)`
- Use for: small accents only (underlines, micro-badges, subtle button sheen)

---

## Glass UI Spec (Modern iOS-style)

Goal: premium “frosted” panels that match the club’s navy + water blue.

- Glass background: `rgba(30, 43, 96, 0.18)`
- Glass border: `rgba(255, 255, 255, 0.30)`
- Highlight glow: `rgba(90, 185, 231, 0.22)`
- Backdrop blur: `blur(14px) saturate(130%)`
- Shadow: soft and wide, avoid harsh drops

Recommended CSS tokens:
- `--glass-bg: rgba(30, 43, 96, 0.18)`
- `--glass-border: rgba(255, 255, 255, 0.30)`
- `--glass-highlight: rgba(90, 185, 231, 0.22)`
- `--glass-blur: 14px`

Corner radii:
- Nav container: 18px (rounded rectangle)
- Cards: 18–24px
- Buttons: 999px (pill) or 16px (rounded rectangle) depending on component

---

## Motifs & Layout Language (From Logo)

### Wave Arc Motif
- Use vector wave dividers between sections.
- Prefer 2–3 layered waves at low opacity (30/50/100%).
- Motion: subtle drift only (slow). Avoid bubble effects.

### Crest / Badge Motif
- Use small “badge chips” for:
  - Day labels (Wednesday/Thursday/Sunday)
  - “EST 1973” microtext
  - Section markers
- Shape: circular or rounded rectangle.

---

## Hero Video Treatment

### Overlay (for readability)
Use a navy vignette overlay so text remains readable over pool footage.
Suggested overlay:
- `linear-gradient(180deg, rgba(15,23,51,0.55) 0%, rgba(15,23,51,0.15) 55%, rgba(15,23,51,0.55) 100%)`

### Behaviour intent
- On load: hero is framed (padding + rounded corners), nav floats over hero.
- On scroll start: hero expands to full-bleed and chapters scroll over pinned video.
- Hero title appears immediately on load then scrolls away with the intro chapter.

---

## Suggested CSS Variables (Drop-in)

css
:root{
  --color-navy: #1e2b60;
  --color-water: #5ab9e7;

  --color-deep-navy: #0f1733;
  --color-mid-navy: #243a7a;
  --color-ice: #dff3ff;
  --color-ink: #070a12;

  --color-white: #ffffff;
  --grey-100: #f5f7fb;
  --grey-300: #d7dce8;
  --grey-700: #2b2f3a;

  --glass-bg: rgba(30, 43, 96, 0.18);
  --glass-border: rgba(255, 255, 255, 0.30);
  --glass-highlight: rgba(90, 185, 231, 0.22);
  --glass-blur: 14px;

  --brand-gradient: linear-gradient(90deg, #5ab9e7 0%, #5ab9e7 45%, #1e2b60 55%, #1e2b60 100%);
}
