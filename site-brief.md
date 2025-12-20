# brief.md — WWUWH Website Rebuild (Integrated-style layout, WWUWH content)

## 1) Project summary
Build a new static website for **West Wickham Underwater Hockey Club (WWUWH)** that:
- **Looks and feels** like the *layout / design language* of https://integratedbiosciences.com/ (minimal, premium, large typography, scroll-led sections, strong photography/media).
- Keeps the **content structure and information architecture** of https://wwuwh.com/ (pages, navigation, key facts, session details, membership info, kit guide, events and social links).

Important: We are recreating *layout patterns and interaction ideas* only — **do not copy any text, images, branding assets, or code** from integratedbiosciences.com. Use our own assets and WWUWH content.

## 2) Primary goals (in priority order)
1) Make it instantly clear **who the club is** and **when/where to play** (sessions + addresses).
2) Drive session sign-up by making **Spond** the primary CTA everywhere it matters.
3) Provide clear guidance for **new players** (what the sport is, what kit they need, how membership works).
4) Make “About” content easy to browse (story, awards, ladies/juniors, tournaments, fundraising).
5) Keep the site fast, accessible, and easy to maintain.

## 3) Audiences
- New players (first-timers)
- Returning/experienced players (members and guest players)
- Juniors + parents/guardians
- Existing club members (fees, rules, where to go)
- Wider underwater hockey community (tournaments, events, socials)

## 4) Reference sites
### Design & interaction reference (visual direction)
- https://integratedbiosciences.com/
Use as reference for:
- Minimal, premium aesthetic
- Large headline-led sections
- Scroll cue (“Scroll”)
- Numbered “01 / 02 / 03” feature section
- Sticky/scroll-driven content blocks
- Clean nav and strong spacing

### Content & structure reference (source of truth)
- https://wwuwh.com/
Use as reference for:
- Page list + navigation labels
- Session schedule + locations
- Membership information and rules
- Kit guide topics and structure
- Events link-out behaviour
- Social/connect links
- Privacy policy presence

## 5) Non-negotiable content (must be accurate)
### Home: sessions (display prominently)
- **Wednesday (Members & Guests)** — 9PM to 10PM  
  South Norwood Leisure Centre, 164 Portland Road, London SE25 4PT
- **Thursday (Members & Guests)** — 9PM to 10PM  
  Downham Leisure Centre, Moorside Road, London BR1 5EW
- **Sunday (Juniors only)** — 3:30PM to 4:30PM  
  De Stafford Sports Centre, Burntwood Lane, Caterham CR3 5YX
Include instruction: “Please register session attendance by enrolling with Spond.”

### Membership (key rules to keep)
- Memberships expire **31st August** each year; annual fees are **pro-rated** to a common renewal date.
- Fees are designed as **monthly ongoing** payments to cover club/pool costs.
- Payments via **standing order** to club account (details provided elsewhere / not hardcoded if sensitive).
- Guests welcome, but **members get priority**; guest attendance via Spond and subject to approval/space.
- Student and junior notes exist on the membership page — keep the structure and include those policies.

### Events behaviour
- Events page can be a **simple link-out** to BOA events (as the current site does).

### Connect / social links
- Connect page should provide clear outbound links for:
  Facebook, YouTube, Instagram, Twitter/X, WhatsApp (click-to-chat)

## 6) Information architecture (pages + subpages)
Top navigation:
- Home
- About
  - Our Story
  - Player of the Year
  - Ladies Club
  - Juniors Club
  - European Tournaments
  - Fundraising
- Kit Guide
- Membership
- Events
- Connect
Footer:
- Privacy Policy
- Cookie/analytics notice

## 7) Page requirements (content + layout expectations)

### Home
Purpose: immediate orientation + sign-up.
Layout direction (Integrated-style):
- Full-viewport hero with strong typographic headline and subhead, plus a “Scroll” cue.
- A premium, minimal section rhythm with generous spacing and strong imagery/video.

Content blocks:
1) Hero
   - Title: “West Wickham Underwater Hockey Club”
   - Subhead: “South London club, hosting, coaching and games.”
   - Primary CTA: “Enrol with Spond”
2) Sessions (non-negotiable)
   - Three session cards (Wed/Thu/Sun) with time, location, address
   - Each card includes: “Enrol with Spond” button
3) “What we do” / numbered section (Integrated-inspired 01/02/03)
   - 01. Play (games)
   - 02. Coach (skills & development)
   - 03. Compete (tournaments & community)
   (Copy can be short; each has 1–2 lines and an optional image)
4) Quick links / pathway blocks
   - New to UWH? (links to Our Story “Introduction to the Sport” and Kit Guide)
   - Membership (links to Membership page)
   - Events (links to Events)
   - Connect (links to Connect)
5) Footer CTA
   - Repeat primary CTA (Spond) + social links preview

### About (landing page)
Purpose: easy overview and navigation to subpages.
- Short intro, then a clean grid/list linking to each About subpage.
- Keep each subpage lightweight, image-friendly, and easy to scan.

#### Our Story
- Club origin and history content (can be summarised but keep key facts).
- Include an “Introduction to the sport” explainer section.

#### Player of the Year
- Explain the tradition + show winners list/gallery if available (or placeholder).

#### Ladies Club
- Image-led page with a short intro + pathway to join + contact CTA.

#### Juniors Club
- Junior session detail + progression guidance + how to enquire/join.

#### European Tournaments
- Explain purpose + list/tiles of tournaments (placeholders OK).

#### Fundraising
- Feature the “Channel swim for MNDA” story + fundraising total (as per current site).

### Kit Guide
Purpose: beginners’ confidence + practical buying guidance.
- Keep section headings and flow similar to current site.
- Recommended sections:
  Fins, Masks, Snorkels, Sticks, Gloves, Mouth Guard, Hats, Fin Retainers, Socks/Foot protection, Swimwear, Pucks, Goals, Shops.
- Include outbound links to key shops/websites as on the current site.

### Membership
Purpose: explain tiers, rules, and how to join.
- Present membership tiers clearly (cards/table).
- Follow with “Additional Information” and “Our Vision” sections.
- Include clear next steps:
  - Join via Spond (CTA)
  - BOA registration link for new players (CTA)

### Events
Purpose: simple and clear.
- Either:
  (A) A branded page that links out to BOA events, or
  (B) An embedded list (only if low effort and reliable).
- Keep the same “don’t overcomplicate” behaviour as current site.

### Connect
Purpose: frictionless contact + socials.
- Show large icon buttons/links:
  Facebook, YouTube, Instagram, Twitter/X, WhatsApp
- Optional: add a short “message us to get involved” line.

### Privacy Policy + Cookies
- Keep a Privacy Policy page and cookie notice (can be adapted from current site content).
- Ensure cookie banner works without breaking basic browsing.

## 8) Design direction (Integrated-inspired)
- Minimal, premium, “editorial” feel
- Large typography, strong whitespace, subtle dividers
- High-quality imagery/video treated like a hero “figure”
- Motion: gentle fades/translate, scroll-triggered highlights
- Signature interaction: numbered 01/02/03 section with sticky/scroll activation
- Keep everything readable and accessible (contrast, focus states, reduced motion)

## 9) Technical requirements
- Build as a simple static site: HTML/CSS/JS (no heavy framework).
- Mobile-first, responsive.
- Accessibility:
  - Semantic headings and landmarks
  - Keyboard navigation
  - Visible focus states
  - prefers-reduced-motion support
- Performance:
  - Optimised media (lazy-load, responsive images)
  - Avoid heavy JS libraries
- SEO basics:
  - Unique titles/meta descriptions
  - OpenGraph/Twitter cards
  - Sitemap + robots.txt (optional)

## 10) Assets + repository rules
- Use `assets-manifest.csv` as the source of truth for all asset paths.
- Do not invent filenames. If an asset is missing, add a TODO rather than guessing.
- Keep code modular: reusable components/partials for header, footer, cards, sections.

## 11) Deliverables
- Page templates for: Home, About + subpages, Kit Guide, Membership, Events, Connect, Privacy Policy
- Global header/footer
- “Sessions” card component
- Integrated-inspired “01/02/03” scroll section
- Final polish pass for accessibility and performance

## 12) Out of scope (for now)
- Member login area
- Payments processing inside the site
- Complex CMS (unless explicitly added later)
