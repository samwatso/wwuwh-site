# West Wickham Underwater Hockey Club

Static website for West Wickham Underwater Hockey Club (WWUWH) — a South London club established in 1973, hosting, coaching, and competing in underwater hockey (Octopush).

**Live site:** [wwuwh.com](https://wwuwh.com)

---

## Overview

A modern, mobile-first static site built with HTML, CSS, and vanilla JavaScript. Features a premium "aquatic minimalism" design with glass-morphism UI elements, wave motifs, and a navy/water-blue colour palette.

---

## Site Structure

```
/
├── index.html                 # Home — hero, sessions, 01/02/03 scrolly section
├── about/
│   ├── our-story/            # Club history since 1973, intro to the sport
│   ├── player-of-the-year/   # Annual award + winners gallery (1983–present)
│   ├── ladies/               # Women's programme + Swickham Ladies
│   ├── juniors/              # Youth sessions + development pathway
│   ├── tournaments/          # European tournament map + lightbox galleries
│   └── fundraising/          # Channel swim for MNDA charity event
├── kit/                      # Equipment guide for new players
├── membership/               # Tiers, fees, and how to join
├── events/                   # Interactive calendar (fetches from Google Calendar)
├── connect/                  # Social links hub
└── privacy/                  # Privacy policy
```

---

## Design System

### Colour Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `--color-navy` | `#1e2b60` | Primary UI, headings, nav |
| `--color-water` | `#5ab9e7` | Accents, hover states, highlights |
| `--color-deep-navy` | `#0f1733` | Hero overlays, footer |
| `--color-mid-navy` | `#243a7a` | Secondary buttons, borders |
| `--color-ice` | `#dff3ff` | Light section backgrounds |
| `--color-ink` | `#070a12` | Deep shadows |

### Typography

- **Headings:** Azonix (display font) — uppercase, letter-spacing 0.04em
- **Body:** Nexa Light — 16–20px, line-height 1.6–1.75

### Glass UI

Frosted glass-morphism panels for navigation and cards:
- Background: `rgba(245, 247, 251, 0.18)`
- Border: `rgba(255, 255, 255, 0.42)`
- Backdrop blur: 18px
- Border radius: 28px (nav), 20px (cards)

---

## Features

### Home Page
- Full-viewport hero with video background and navy vignette overlay
- Floating glass navigation with dropdown
- **01/02/03 scrolly section** — scroll-driven chapter activation with progress rail
- Session cards (Wednesday/Thursday/Sunday) with venue details and map links
- Instagram feed integration (Behold widget, lazy-loaded)

### Events Calendar
- Custom month-view calendar grid (Monday start)
- Fetches events from `/api/calendar.json` (sourced from Google Calendar)
- Event modal with ICS download
- Keyboard accessible navigation

### Tournament Map
- Interactive Europe map with location pins
- Lightbox galleries for each tournament
- Arrow key navigation within galleries

### Accessibility
- Semantic HTML5 structure
- ARIA labels and roles throughout
- Keyboard navigation for all interactive elements
- `prefers-reduced-motion` support — animations disabled when preference set
- Visible focus states (water-blue outline)
- Skip link implementation

---

## Tech Stack

- **HTML5** — semantic markup
- **CSS** — single stylesheet (~11,000 lines), CSS variables, mobile-first responsive
- **JavaScript** — vanilla JS, modular files:
  - `nav.js` — navigation, dropdowns, mobile menu
  - `scroll.js` — scroll animations, lazy loading, scrolly section
  - `events.js` — calendar UI and event handling
  - `tournaments.js` — lightbox galleries
  - `poty.js` — Player of the Year carousel
  - `cookies.js` — consent banner

---

## Assets

```
assets/
├── fonts/           # Azonix.otf, Nexa Light.otf
├── video/           # hero-mobile.mp4
├── history/         # Club heritage photos
├── ladies/          # Women's team photos
├── junior/          # Youth programme images
├── kit/             # Equipment category images
├── poty/            # Player of the Year gallery
├── touraments/      # Tournament event photos
├── fundraising/     # Channel swim event images
├── maps/            # Europe silhouette SVG
└── [pool images]    # South Norwood, Downham, Caterham venues
```

---

## Development Files

| File | Purpose |
|------|---------|
| `theme.md` | Design tokens — colours, typography, glass UI specs |
| `site-brief.md` | Project brief and requirements |
| `reference-notes.md` | Visual direction and component patterns |
| `content.md` | Copy deck and content structure |

---

## Sessions

| Day | Time | Venue | Who |
|-----|------|-------|-----|
| Wednesday | 9–10 PM | South Norwood Leisure Centre | Members & Guests |
| Thursday | 9–10 PM | Downham Leisure Centre | Members & Guests |
| Sunday | 3:30–4:30 PM | De Stafford Sports Centre, Caterham | Juniors |

Register attendance via our [members app](https://wwuwh.com/app/).

---

## Links

- **Website:** [wwuwh.com](https://wwuwh.com)
- **Instagram:** [@wwuwh](https://instagram.com/wwuwh)
- **Facebook:** [westwickhamuwh](https://facebook.com/westwickhamuwh)
- **YouTube:** [West Wickham UWH](https://youtube.com/channel/UCdokEqYEbzyqtcgUGdhz6xw)
- **WhatsApp:** [Message us](https://wa.me/+447837554270)

---

## Affiliation

Member of the [British Octopush Association (BOA)](https://www.gbuwh.co.uk/)

---

*Est. 1973*
