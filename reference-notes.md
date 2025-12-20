# reference-notes.md — WWUWH visual direction (Integrated-style patterns + WWUWH brand tokens)

## Purpose
This site should **use the layout and interaction patterns** of integratedbiosciences.com (premium minimal, scroll-led sections, numbered “01/02/03” chaptering), while **keeping the information architecture and content requirements** of wwuwh.com (sessions, about subpages, kit guide, membership, events, connect).

This is **not a clone**:
- Do **not** copy any text, imagery, icons, illustrations, or source code from the reference site.
- Use the reference for **patterns and pacing**, not assets.

---

## Brand theme tokens (source of truth)
Use `theme.md` as the single source of truth for:
- Typography: **Azonix** for headings/labels; **Nexa Light** for body/UI.
- Palette: `--color-navy` (primary), `--color-water` (accent), plus deep/mid/ice/ink neutrals.
- Glass UI: `--glass-bg`, `--glass-border`, `--glass-highlight`, `--glass-blur`.
- Motifs: **wave arc dividers** + small **crest/badge chips**.
- Hero video treatment: navy vignette overlay gradient for readability.

---

## Visual “north star”
**Premium aquatic minimalism**:
- Dark navy + ice backgrounds with water-blue highlights
- Clean typography with strong hierarchy (big uppercase headings, short supporting lines)
- Generous whitespace and confident, uncluttered layouts
- “Glass” panels floating over media (nav + key cards)

---

## Typography rules (must follow theme.md)
### Headings / Display (Azonix)
- Use for: H1/H2/H3, day chips, small UI labels
- Style:
  - Uppercase for hero and section titles
  - Letter spacing:
    - Large headings: `0.04em`
    - Small labels: `0.08em`
  - Use the specified hero text shadow for readability over video:
    - `text-shadow: 0 8px 24px rgba(0,0,0,0.35)`

### Body / UI (Nexa Light)
- Use for: nav, buttons, paragraph copy, addresses, captions
- Sizes:
  - 16–18px mobile, 18–20px desktop
  - line-height 1.6–1.75
- Keep paragraphs short; prefer 1–2 sentence blocks and bullets for scannability.

---

## Colour usage (how it should feel)
- Primary surfaces: `--color-deep-navy`, `--color-navy`, `--grey-100`, `--color-ice`
- Accents / focus / progress: `--color-water`
- High contrast overlays (sparingly): `--color-ink`
- Dividers and borders: `--grey-300` or semi-transparent white on dark
- Gradient `--brand-gradient`: use only for **micro accents** (tiny underline, badge sheen), never as a large background.

---

## Layout patterns to emulate (Integrated-inspired)
### 1) Full-viewport hero (with WWUWH video)
- Hero is the “stage”: media + overlay + headline + CTA + scroll cue
- Nav can float over hero inside a **glass** container (rounded 18px)
- Text appears immediately on load (no delayed reveal)
- Hero overlay uses the theme’s navy vignette gradient for readability

### 2) Numbered “01 / 02 / 03” chapter section (signature)
- Use a scroll-driven/sticky pattern:
  - Left rail: 01/02/03 + progress line (accent in `--color-water`)
  - Right panel: step content activates as you scroll
- Copy per step: 1–2 lines max
- Suggested WWUWH mapping:
  - 01 Play (games)
  - 02 Coach (skills)
  - 03 Compete (tournaments/community)
- Keep motion subtle; support `prefers-reduced-motion`.

### 3) Card grids (clean, minimal)
- Use consistent cards for:
  - Session cards (Wed/Thu/Sun)
  - Quick links (“New to UWH”, “Kit Guide”, “Membership”, “Events”, “Connect”)
  - About landing page subpage tiles
- Cards should be either:
  - Ice background with navy text, or
  - Glass panels on dark/hero media
- Avoid “busy” UI: no heavy borders, no loud shadows.

### 4) Footer as a final CTA
- Repeat primary CTA (“Enrol with Spond”)
- Social links + policy links
- Dark, calm finish: deep navy/ink background, water accents.

---

## WWUWH motifs to include (from theme.md)
### Wave arc dividers
- Use subtle layered wave dividers between major sections
- 2–3 layers, low opacity, gentle drift only (if animated)
- Avoid bubbles/novelty; keep it premium.

### Crest / badge chips
- Use small chips for:
  - Session day labels (Wednesday/Thursday/Sunday)
  - “EST 1973”
  - Section markers
- Shapes: circle or rounded rectangle; Azonix uppercase; letter spacing 0.08em.

---

## Interaction & motion guidelines
- Motion should support comprehension, not distract:
  - Fade/slide-in on scroll for section entrances
  - Active state highlights for the numbered chapter section
- Implementation preferences:
  - IntersectionObserver for scroll activation
  - No heavy animation libraries
- Must support:
  - `prefers-reduced-motion: reduce` (disable or simplify transitions/scroll effects)

---

## Component checklist (build these to match the vibe)
- Glass header / nav container (18px radius)
- Hero media stage with overlay gradient + scroll cue
- Primary CTA button (pill or 16px rounded, confident padding)
- Session card component:
  - Day chip, time, venue name, full address, map link, CTA
- Numbered 01/02/03 scroll chapter component:
  - Sticky left rail + progress indicator + active step styles
- Quick link tiles grid (home)
- About landing grid linking to subpages
- Kit Guide section layout (anchors or accordion; keep scannable)
- Membership tier cards + “How to join” CTA blocks
- Connect page with large icon buttons (socials + WhatsApp)
- Footer CTA + socials + policies

---

## Content + structure guardrails (must remain true to WWUWH)
- Navigation and page set must match WWUWH:
  - Home, About (+ subpages), Kit Guide, Membership, Events, Connect
- Home must prioritise:
  - Session schedule and locations (clear, scannable)
  - Primary CTA: Spond enrolment
- Don’t invent programmes, venues, times, or policies.

---

## Accessibility & quality bar
- Semantic structure:
  - One H1 per page; logical H2/H3
  - Proper landmarks (header/nav/main/footer)
- Keyboard accessible nav and interactive controls
- Visible focus states (use `--color-water` as focus accent)
- Readability:
  - Maintain contrast; don’t put body text directly on busy video without overlay
- Performance:
  - Lazy-load images/video where appropriate
  - Keep JS lightweight; avoid large dependencies

---

## “Success looks like…”
- Feels modern, premium, and confident — “Integrated-like” in layout and pacing
- A first-time visitor can answer quickly:
  - What is WWUWH?
  - When/where can I play?
  - How do I join / enrol?
- The site stays maintainable:
  - consistent tokens, reusable components, no hardcoded random styles
