#!/usr/bin/env node
/**
 * Badge SVG Generator
 * Generates premium Apple Fitness-style badge SVGs
 */

import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = join(__dirname, '../public/badges')

// Ensure output directory exists
mkdirSync(OUTPUT_DIR, { recursive: true })

// Color palette
const COLORS = {
  navy: '#1e3a5f',
  navyDark: '#0f1d2f',
  navyLight: '#2d5a8a',
  gold: '#d4af37',
  goldLight: '#f0d875',
  goldDark: '#9c7c1c',
  silver: '#c0c0c0',
  silverLight: '#e8e8e8',
  silverDark: '#8a8a8a',
  white: '#ffffff',
  highlight: 'rgba(255,255,255,0.3)',
}

// Badge definitions with pictogram paths
const BADGES = [
  // Attendance Streaks
  { key: 'first_dip_round', name: 'First Dip', pictogram: 'droplet' },
  { key: 'back_to_back_hex', name: 'Back-to-Back', pictogram: 'chain' },
  { key: 'triple_threat_shield', name: 'Triple Threat', pictogram: 'chevrons3' },
  { key: 'perfect_week_round', name: 'Perfect Week', pictogram: 'calendarCheck' },
  { key: 'four_week_flow_hex', name: 'Four-Week Flow', pictogram: 'bars4' },
  { key: 'twelve_week_habit_shield', name: '12-Week Habit', pictogram: 'laurel12' },
  { key: 'unbroken_month_round', name: 'Unbroken Month', pictogram: 'loop' },
  { key: 'streak_saver_hex', name: 'Streak Saver', pictogram: 'bandage' },

  // Session Milestones
  { key: 'sessions_5_round', name: '5 Sessions', pictogram: 'medal5' },
  { key: 'sessions_10_hex', name: '10 Sessions', pictogram: 'medal10' },
  { key: 'sessions_25_shield', name: '25 Sessions', pictogram: 'laurel25' },
  { key: 'sessions_50_round', name: '50 Sessions', pictogram: 'crown50' },
  { key: 'sessions_100_hex', name: '100 Sessions', pictogram: 'trophy100' },
  { key: 'club_200_shield', name: '200 Club', pictogram: 'starCluster' },
  { key: 'season_centurion_round', name: 'Season Centurion', pictogram: 'compass100' },

  // Reliability
  { key: 'on_time_hex', name: 'On Time', pictogram: 'clockCheck' },
  { key: 'dependable_shield', name: 'Dependable', pictogram: 'handshake' },
  { key: 'ironclad_round', name: 'Ironclad', pictogram: 'shieldLock' },
  { key: 'always_ready_hex', name: 'Always Ready', pictogram: 'letterW' },
  { key: 'thursday_regular_shield', name: 'Thursday Regular', pictogram: 'letterT' },
  { key: 'sunday_specialist_round', name: 'Sunday Specialist', pictogram: 'sun' },

  // RSVP Behavior
  { key: 'early_bird_hex', name: 'Early Bird', pictogram: 'bird' },
  { key: 'last_minute_hero_shield', name: 'Last Minute Hero', pictogram: 'lightning' },
  { key: 'squad_builder_round', name: 'Squad Builder', pictogram: 'groupPlus' },
  { key: 'full_bench_hex', name: 'Full Bench', pictogram: 'bench' },
  { key: 'captains_pick_shield', name: "Captain's Pick", pictogram: 'whistle' },

  // Team/Position
  { key: 'white_cap_round', name: 'White Cap', pictogram: 'capW' },
  { key: 'black_cap_hex', name: 'Black Cap', pictogram: 'capB' },
  { key: 'forward_line_shield', name: 'Forward Line', pictogram: 'trident' },
  { key: 'wing_runner_round', name: 'Wing Runner', pictogram: 'wing' },
  { key: 'centre_control_hex', name: 'Centre Control', pictogram: 'crosshair' },
  { key: 'backline_anchor_shield', name: 'Backline Anchor', pictogram: 'anchor' },
  { key: 'utility_player_round', name: 'Utility Player', pictogram: 'multiTool' },
  { key: 'third_team_hex', name: 'Third Team', pictogram: 'triangle3' },

  // Events & Tournaments
  { key: 'first_friendly_round', name: 'First Friendly', pictogram: 'handshakeWave' },
  { key: 'tournament_debut_hex', name: 'Tournament Debut', pictogram: 'trophyFlag' },
  { key: 'road_trip_shield', name: 'Road Trip', pictogram: 'roadSign' },
  { key: 'international_waters_round', name: 'International Waters', pictogram: 'globe' },
  { key: 'camp_week_hex', name: 'Camp Week', pictogram: 'tent' },
  { key: 'finals_ready_shield', name: 'Finals Ready', pictogram: 'podium' },

  // Anniversary
  { key: 'anniversary_1y_round', name: 'Anniversary - 1 Year', pictogram: 'candle1' },
  { key: 'anniversary_5y_hex', name: 'Anniversary - 5 Years', pictogram: 'star5' },
  { key: 'anniversary_10y_shield', name: 'Anniversary - 10 Years', pictogram: 'crown10' },

  // Seasonal
  { key: 'new_year_splash_round', name: 'New Year Splash', pictogram: 'snowflake' },
  { key: 'spring_surge_hex', name: 'Spring Surge', pictogram: 'blossom' },
  { key: 'summer_series_shield', name: 'Summer Series', pictogram: 'sunWaves' },
]

// Pictogram SVG paths (centered around 0,0, scale to fit ~180px)
const PICTOGRAMS = {
  // Water droplet with ripples
  droplet: `
    <path d="M256 140 C256 140 180 240 180 300 C180 350 212 390 256 390 C300 390 332 350 332 300 C332 240 256 140 256 140 Z" fill="${COLORS.goldLight}" stroke="${COLORS.gold}" stroke-width="6"/>
    <ellipse cx="256" cy="420" rx="60" ry="12" fill="none" stroke="${COLORS.goldLight}" stroke-width="4" opacity="0.6"/>
    <ellipse cx="256" cy="440" rx="80" ry="14" fill="none" stroke="${COLORS.goldLight}" stroke-width="3" opacity="0.4"/>
  `,

  // Linked chain
  chain: `
    <ellipse cx="200" cy="256" rx="50" ry="70" fill="none" stroke="${COLORS.goldLight}" stroke-width="20" stroke-linecap="round"/>
    <ellipse cx="312" cy="256" rx="50" ry="70" fill="none" stroke="${COLORS.goldLight}" stroke-width="20" stroke-linecap="round"/>
    <rect x="200" y="200" width="112" height="112" fill="${COLORS.navy}"/>
  `,

  // Triple chevrons pointing up
  chevrons3: `
    <path d="M180 320 L256 250 L332 320" fill="none" stroke="${COLORS.goldLight}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M180 270 L256 200 L332 270" fill="none" stroke="${COLORS.goldLight}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M180 220 L256 150 L332 220" fill="none" stroke="${COLORS.goldLight}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
  `,

  // Calendar with checkmark
  calendarCheck: `
    <rect x="170" y="170" width="172" height="172" rx="16" fill="none" stroke="${COLORS.goldLight}" stroke-width="12"/>
    <line x1="170" y1="220" x2="342" y2="220" stroke="${COLORS.goldLight}" stroke-width="12"/>
    <line x1="210" y1="140" x2="210" y2="180" stroke="${COLORS.goldLight}" stroke-width="12" stroke-linecap="round"/>
    <line x1="302" y1="140" x2="302" y2="180" stroke="${COLORS.goldLight}" stroke-width="12" stroke-linecap="round"/>
    <path d="M210 290 L240 320 L310 250" fill="none" stroke="${COLORS.goldLight}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>
  `,

  // 4 ascending bars
  bars4: `
    <rect x="160" y="300" width="35" height="60" rx="6" fill="${COLORS.goldLight}"/>
    <rect x="210" y="260" width="35" height="100" rx="6" fill="${COLORS.goldLight}"/>
    <rect x="260" y="220" width="35" height="140" rx="6" fill="${COLORS.goldLight}"/>
    <rect x="310" y="180" width="35" height="180" rx="6" fill="${COLORS.goldLight}"/>
  `,

  // Laurel with 12 mark
  laurel12: `
    <path d="M180 340 Q140 256 180 170" fill="none" stroke="${COLORS.goldLight}" stroke-width="10" stroke-linecap="round"/>
    <path d="M332 340 Q372 256 332 170" fill="none" stroke="${COLORS.goldLight}" stroke-width="10" stroke-linecap="round"/>
    <text x="256" y="280" font-family="Georgia, serif" font-size="80" font-weight="bold" fill="${COLORS.goldLight}" text-anchor="middle">12</text>
  `,

  // Continuous loop/infinity
  loop: `
    <path d="M160 256 C160 200 200 180 240 220 C280 260 280 260 320 220 C360 180 400 200 400 256 C400 312 360 332 320 292 C280 252 280 252 240 292 C200 332 160 312 160 256 Z" fill="none" stroke="${COLORS.goldLight}" stroke-width="16" stroke-linecap="round"/>
  `,

  // Bandage/repair
  bandage: `
    <rect x="140" y="220" width="232" height="72" rx="36" fill="none" stroke="${COLORS.goldLight}" stroke-width="12" transform="rotate(-45 256 256)"/>
    <line x1="220" y1="240" x2="220" y2="272" stroke="${COLORS.goldLight}" stroke-width="6" stroke-linecap="round" transform="rotate(-45 256 256)"/>
    <line x1="256" y1="240" x2="256" y2="272" stroke="${COLORS.goldLight}" stroke-width="6" stroke-linecap="round" transform="rotate(-45 256 256)"/>
    <line x1="292" y1="240" x2="292" y2="272" stroke="${COLORS.goldLight}" stroke-width="6" stroke-linecap="round" transform="rotate(-45 256 256)"/>
  `,

  // Medal with 5
  medal5: `
    <circle cx="256" cy="280" r="80" fill="none" stroke="${COLORS.goldLight}" stroke-width="12"/>
    <text x="256" y="305" font-family="Georgia, serif" font-size="70" font-weight="bold" fill="${COLORS.goldLight}" text-anchor="middle">5</text>
    <path d="M220 160 L256 200 L292 160" fill="none" stroke="${COLORS.goldLight}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
  `,

  // Double medal with 10
  medal10: `
    <circle cx="256" cy="280" r="80" fill="none" stroke="${COLORS.goldLight}" stroke-width="12"/>
    <circle cx="256" cy="280" r="60" fill="none" stroke="${COLORS.goldLight}" stroke-width="6"/>
    <text x="256" y="305" font-family="Georgia, serif" font-size="60" font-weight="bold" fill="${COLORS.goldLight}" text-anchor="middle">10</text>
  `,

  // Laurel with 25
  laurel25: `
    <path d="M170 350 Q120 256 170 160" fill="none" stroke="${COLORS.goldLight}" stroke-width="12" stroke-linecap="round"/>
    <path d="M342 350 Q392 256 342 160" fill="none" stroke="${COLORS.goldLight}" stroke-width="12" stroke-linecap="round"/>
    <text x="256" y="285" font-family="Georgia, serif" font-size="75" font-weight="bold" fill="${COLORS.goldLight}" text-anchor="middle">25</text>
  `,

  // Crown with 50
  crown50: `
    <path d="M160 320 L180 200 L220 260 L256 180 L292 260 L332 200 L352 320 Z" fill="none" stroke="${COLORS.goldLight}" stroke-width="12" stroke-linejoin="round"/>
    <text x="256" y="390" font-family="Georgia, serif" font-size="50" font-weight="bold" fill="${COLORS.goldLight}" text-anchor="middle">50</text>
  `,

  // Trophy with 100
  trophy100: `
    <path d="M200 180 L200 280 C200 330 220 360 256 360 C292 360 312 330 312 280 L312 180" fill="none" stroke="${COLORS.goldLight}" stroke-width="12" stroke-linecap="round"/>
    <path d="M200 200 C160 200 140 240 160 280 C170 300 190 300 200 280" fill="none" stroke="${COLORS.goldLight}" stroke-width="10"/>
    <path d="M312 200 C352 200 372 240 352 280 C342 300 322 300 312 280" fill="none" stroke="${COLORS.goldLight}" stroke-width="10"/>
    <rect x="230" y="360" width="52" height="20" fill="${COLORS.goldLight}"/>
    <rect x="210" y="380" width="92" height="12" rx="4" fill="${COLORS.goldLight}"/>
  `,

  // Star cluster
  starCluster: `
    <polygon points="256,140 268,180 310,180 276,204 288,246 256,220 224,246 236,204 202,180 244,180" fill="${COLORS.goldLight}"/>
    <polygon points="190,260 198,284 224,284 204,300 212,324 190,308 168,324 176,300 156,284 182,284" fill="${COLORS.goldLight}" transform="scale(0.8) translate(40, 60)"/>
    <polygon points="322,260 330,284 356,284 336,300 344,324 322,308 300,324 308,300 288,284 314,284" fill="${COLORS.goldLight}" transform="scale(0.8) translate(60, 60)"/>
  `,

  // Compass with 100
  compass100: `
    <circle cx="256" cy="256" r="90" fill="none" stroke="${COLORS.goldLight}" stroke-width="10"/>
    <path d="M256 170 L270 240 L256 256 L242 240 Z" fill="${COLORS.goldLight}"/>
    <path d="M256 342 L270 272 L256 256 L242 272 Z" fill="${COLORS.goldLight}" opacity="0.5"/>
    <circle cx="256" cy="256" r="15" fill="${COLORS.goldLight}"/>
  `,

  // Clock with checkmark
  clockCheck: `
    <circle cx="256" cy="256" r="90" fill="none" stroke="${COLORS.goldLight}" stroke-width="12"/>
    <line x1="256" y1="256" x2="256" y2="190" stroke="${COLORS.goldLight}" stroke-width="10" stroke-linecap="round"/>
    <line x1="256" y1="256" x2="310" y2="280" stroke="${COLORS.goldLight}" stroke-width="10" stroke-linecap="round"/>
    <circle cx="256" cy="256" r="12" fill="${COLORS.goldLight}"/>
    <path d="M320 340 L340 360 L380 310" fill="none" stroke="${COLORS.goldLight}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
  `,

  // Handshake
  handshake: `
    <path d="M160 280 L200 240 L240 280 L280 240 L320 280" fill="none" stroke="${COLORS.goldLight}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M140 240 L180 200" fill="none" stroke="${COLORS.goldLight}" stroke-width="14" stroke-linecap="round"/>
    <path d="M372 240 L332 200" fill="none" stroke="${COLORS.goldLight}" stroke-width="14" stroke-linecap="round"/>
    <circle cx="256" cy="330" r="30" fill="none" stroke="${COLORS.goldLight}" stroke-width="10"/>
    <path d="M240 330 L252 342 L275 318" fill="none" stroke="${COLORS.goldLight}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
  `,

  // Shield with lock
  shieldLock: `
    <path d="M256 150 L340 190 L340 290 C340 350 256 390 256 390 C256 390 172 350 172 290 L172 190 Z" fill="none" stroke="${COLORS.goldLight}" stroke-width="14" stroke-linejoin="round"/>
    <rect x="226" y="260" width="60" height="50" rx="8" fill="none" stroke="${COLORS.goldLight}" stroke-width="10"/>
    <path d="M236 260 L236 240 C236 220 246 210 256 210 C266 210 276 220 276 240 L276 260" fill="none" stroke="${COLORS.goldLight}" stroke-width="10"/>
    <circle cx="256" cy="285" r="8" fill="${COLORS.goldLight}"/>
  `,

  // Letter W with streak
  letterW: `
    <text x="256" y="300" font-family="Georgia, serif" font-size="120" font-weight="bold" fill="${COLORS.goldLight}" text-anchor="middle">W</text>
    <line x1="180" y1="340" x2="332" y2="340" stroke="${COLORS.goldLight}" stroke-width="10" stroke-linecap="round"/>
  `,

  // Letter T with streak
  letterT: `
    <text x="256" y="300" font-family="Georgia, serif" font-size="120" font-weight="bold" fill="${COLORS.goldLight}" text-anchor="middle">T</text>
    <line x1="180" y1="340" x2="332" y2="340" stroke="${COLORS.goldLight}" stroke-width="10" stroke-linecap="round"/>
  `,

  // Sun icon
  sun: `
    <circle cx="256" cy="256" r="50" fill="${COLORS.goldLight}"/>
    <line x1="256" y1="160" x2="256" y2="130" stroke="${COLORS.goldLight}" stroke-width="14" stroke-linecap="round"/>
    <line x1="256" y1="352" x2="256" y2="382" stroke="${COLORS.goldLight}" stroke-width="14" stroke-linecap="round"/>
    <line x1="160" y1="256" x2="130" y2="256" stroke="${COLORS.goldLight}" stroke-width="14" stroke-linecap="round"/>
    <line x1="352" y1="256" x2="382" y2="256" stroke="${COLORS.goldLight}" stroke-width="14" stroke-linecap="round"/>
    <line x1="188" y1="188" x2="166" y2="166" stroke="${COLORS.goldLight}" stroke-width="14" stroke-linecap="round"/>
    <line x1="324" y1="324" x2="346" y2="346" stroke="${COLORS.goldLight}" stroke-width="14" stroke-linecap="round"/>
    <line x1="188" y1="324" x2="166" y2="346" stroke="${COLORS.goldLight}" stroke-width="14" stroke-linecap="round"/>
    <line x1="324" y1="188" x2="346" y2="166" stroke="${COLORS.goldLight}" stroke-width="14" stroke-linecap="round"/>
  `,

  // Bird
  bird: `
    <path d="M180 280 Q200 240 256 220 Q312 240 332 280" fill="none" stroke="${COLORS.goldLight}" stroke-width="14" stroke-linecap="round"/>
    <path d="M256 220 L256 180 L290 200" fill="none" stroke="${COLORS.goldLight}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="280" cy="195" r="8" fill="${COLORS.goldLight}"/>
    <path d="M140 300 L180 280" fill="none" stroke="${COLORS.goldLight}" stroke-width="12" stroke-linecap="round"/>
    <path d="M372 300 L332 280" fill="none" stroke="${COLORS.goldLight}" stroke-width="12" stroke-linecap="round"/>
  `,

  // Lightning bolt
  lightning: `
    <path d="M290 140 L220 260 L270 260 L220 380 L330 230 L270 230 L310 140 Z" fill="${COLORS.goldLight}" stroke="${COLORS.gold}" stroke-width="6" stroke-linejoin="round"/>
  `,

  // Group with plus
  groupPlus: `
    <circle cx="200" cy="230" r="35" fill="none" stroke="${COLORS.goldLight}" stroke-width="10"/>
    <circle cx="312" cy="230" r="35" fill="none" stroke="${COLORS.goldLight}" stroke-width="10"/>
    <path d="M160 340 C160 300 180 280 200 280 C220 280 240 300 240 340" fill="none" stroke="${COLORS.goldLight}" stroke-width="10"/>
    <path d="M272 340 C272 300 292 280 312 280 C332 280 352 300 352 340" fill="none" stroke="${COLORS.goldLight}" stroke-width="10"/>
    <line x1="256" y1="330" x2="256" y2="380" stroke="${COLORS.goldLight}" stroke-width="12" stroke-linecap="round"/>
    <line x1="230" y1="355" x2="282" y2="355" stroke="${COLORS.goldLight}" stroke-width="12" stroke-linecap="round"/>
  `,

  // Bench seats
  bench: `
    <rect x="150" y="260" width="212" height="30" rx="6" fill="${COLORS.goldLight}"/>
    <rect x="170" y="290" width="12" height="60" fill="${COLORS.goldLight}"/>
    <rect x="330" y="290" width="12" height="60" fill="${COLORS.goldLight}"/>
    <path d="M180 240 L190 210 L210 240" fill="none" stroke="${COLORS.goldLight}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M240 240 L250 210 L260 240" fill="none" stroke="${COLORS.goldLight}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M300 240 L310 210 L320 240" fill="none" stroke="${COLORS.goldLight}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
  `,

  // Whistle with star
  whistle: `
    <ellipse cx="280" cy="280" rx="70" ry="50" fill="none" stroke="${COLORS.goldLight}" stroke-width="12"/>
    <rect x="180" y="260" width="60" height="40" rx="8" fill="none" stroke="${COLORS.goldLight}" stroke-width="12"/>
    <circle cx="160" cy="230" r="20" fill="none" stroke="${COLORS.goldLight}" stroke-width="10"/>
    <polygon points="330,180 338,200 360,200 342,214 350,236 330,220 310,236 318,214 300,200 322,200" fill="${COLORS.goldLight}"/>
  `,

  // White cap
  capW: `
    <ellipse cx="256" cy="290" rx="80" ry="50" fill="none" stroke="${COLORS.goldLight}" stroke-width="12"/>
    <path d="M176 280 C176 220 210 180 256 180 C302 180 336 220 336 280" fill="none" stroke="${COLORS.goldLight}" stroke-width="12"/>
    <text x="256" y="310" font-family="Georgia, serif" font-size="60" font-weight="bold" fill="${COLORS.goldLight}" text-anchor="middle">W</text>
  `,

  // Black cap
  capB: `
    <ellipse cx="256" cy="290" rx="80" ry="50" fill="none" stroke="${COLORS.goldLight}" stroke-width="12"/>
    <path d="M176 280 C176 220 210 180 256 180 C302 180 336 220 336 280" fill="none" stroke="${COLORS.goldLight}" stroke-width="12"/>
    <text x="256" y="310" font-family="Georgia, serif" font-size="60" font-weight="bold" fill="${COLORS.goldLight}" text-anchor="middle">B</text>
  `,

  // Trident
  trident: `
    <line x1="256" y1="150" x2="256" y2="370" stroke="${COLORS.goldLight}" stroke-width="14" stroke-linecap="round"/>
    <path d="M256 150 L256 180 M200 200 L256 150 L312 200" fill="none" stroke="${COLORS.goldLight}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>
    <line x1="200" y1="150" x2="200" y2="200" stroke="${COLORS.goldLight}" stroke-width="14" stroke-linecap="round"/>
    <line x1="312" y1="150" x2="312" y2="200" stroke="${COLORS.goldLight}" stroke-width="14" stroke-linecap="round"/>
    <line x1="220" y1="280" x2="292" y2="280" stroke="${COLORS.goldLight}" stroke-width="10" stroke-linecap="round"/>
  `,

  // Wing/feather
  wing: `
    <path d="M160 300 Q180 200 280 180 Q350 170 360 200 Q340 220 280 230 Q230 240 200 300 Q280 260 340 280 Q320 300 260 310 Q210 320 180 350 Q260 300 320 330 Q290 350 230 360 Q190 370 160 380" fill="none" stroke="${COLORS.goldLight}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
  `,

  // Crosshair/bullseye
  crosshair: `
    <circle cx="256" cy="256" r="80" fill="none" stroke="${COLORS.goldLight}" stroke-width="10"/>
    <circle cx="256" cy="256" r="50" fill="none" stroke="${COLORS.goldLight}" stroke-width="8"/>
    <circle cx="256" cy="256" r="20" fill="${COLORS.goldLight}"/>
    <line x1="256" y1="130" x2="256" y2="176" stroke="${COLORS.goldLight}" stroke-width="10" stroke-linecap="round"/>
    <line x1="256" y1="336" x2="256" y2="382" stroke="${COLORS.goldLight}" stroke-width="10" stroke-linecap="round"/>
    <line x1="130" y1="256" x2="176" y2="256" stroke="${COLORS.goldLight}" stroke-width="10" stroke-linecap="round"/>
    <line x1="336" y1="256" x2="382" y2="256" stroke="${COLORS.goldLight}" stroke-width="10" stroke-linecap="round"/>
  `,

  // Anchor
  anchor: `
    <circle cx="256" cy="180" r="30" fill="none" stroke="${COLORS.goldLight}" stroke-width="12"/>
    <line x1="256" y1="210" x2="256" y2="370" stroke="${COLORS.goldLight}" stroke-width="14" stroke-linecap="round"/>
    <path d="M170 320 L256 370 L342 320" fill="none" stroke="${COLORS.goldLight}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>
    <line x1="200" y1="140" x2="312" y2="140" stroke="${COLORS.goldLight}" stroke-width="12" stroke-linecap="round"/>
    <line x1="256" y1="120" x2="256" y2="150" stroke="${COLORS.goldLight}" stroke-width="12" stroke-linecap="round"/>
  `,

  // Multi-tool/3-way arrows
  multiTool: `
    <line x1="256" y1="160" x2="256" y2="352" stroke="${COLORS.goldLight}" stroke-width="12"/>
    <line x1="160" y1="256" x2="352" y2="256" stroke="${COLORS.goldLight}" stroke-width="12"/>
    <polygon points="256,140 240,175 272,175" fill="${COLORS.goldLight}"/>
    <polygon points="256,372 240,337 272,337" fill="${COLORS.goldLight}"/>
    <polygon points="140,256 175,240 175,272" fill="${COLORS.goldLight}"/>
    <polygon points="372,256 337,240 337,272" fill="${COLORS.goldLight}"/>
    <circle cx="256" cy="256" r="25" fill="${COLORS.goldLight}"/>
  `,

  // Triangle cycle
  triangle3: `
    <polygon points="256,150 350,320 162,320" fill="none" stroke="${COLORS.goldLight}" stroke-width="14" stroke-linejoin="round"/>
    <polygon points="256,190 315,300 197,300" fill="none" stroke="${COLORS.goldLight}" stroke-width="8" stroke-linejoin="round"/>
    <text x="256" y="280" font-family="Georgia, serif" font-size="50" font-weight="bold" fill="${COLORS.goldLight}" text-anchor="middle">3</text>
  `,

  // Handshake with waves
  handshakeWave: `
    <path d="M170 260 L210 220 L250 260 L290 220 L330 260" fill="none" stroke="${COLORS.goldLight}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M160 320 Q256 360 352 320" fill="none" stroke="${COLORS.goldLight}" stroke-width="8" stroke-linecap="round" opacity="0.7"/>
    <path d="M170 350 Q256 385 342 350" fill="none" stroke="${COLORS.goldLight}" stroke-width="6" stroke-linecap="round" opacity="0.5"/>
  `,

  // Trophy with flag
  trophyFlag: `
    <path d="M200 200 L200 300 C200 340 220 360 256 360 C292 360 312 340 312 300 L312 200" fill="none" stroke="${COLORS.goldLight}" stroke-width="10" stroke-linecap="round"/>
    <rect x="234" y="360" width="44" height="16" fill="${COLORS.goldLight}"/>
    <rect x="218" y="376" width="76" height="10" rx="3" fill="${COLORS.goldLight}"/>
    <line x1="340" y1="140" x2="340" y2="280" stroke="${COLORS.goldLight}" stroke-width="8" stroke-linecap="round"/>
    <path d="M340 140 L390 165 L340 190" fill="${COLORS.goldLight}"/>
  `,

  // Road sign
  roadSign: `
    <polygon points="256,150 330,256 256,362 182,256" fill="none" stroke="${COLORS.goldLight}" stroke-width="14" stroke-linejoin="round"/>
    <line x1="256" y1="200" x2="256" y2="280" stroke="${COLORS.goldLight}" stroke-width="12" stroke-linecap="round"/>
    <polygon points="256,280 242,310 270,310" fill="${COLORS.goldLight}"/>
  `,

  // Globe with wave
  globe: `
    <circle cx="256" cy="256" r="85" fill="none" stroke="${COLORS.goldLight}" stroke-width="10"/>
    <ellipse cx="256" cy="256" rx="40" ry="85" fill="none" stroke="${COLORS.goldLight}" stroke-width="8"/>
    <line x1="171" y1="256" x2="341" y2="256" stroke="${COLORS.goldLight}" stroke-width="8"/>
    <path d="M180 210 Q256 190 332 210" fill="none" stroke="${COLORS.goldLight}" stroke-width="8"/>
    <path d="M180 302 Q256 322 332 302" fill="none" stroke="${COLORS.goldLight}" stroke-width="8"/>
  `,

  // Tent
  tent: `
    <path d="M150 350 L256 170 L362 350" fill="none" stroke="${COLORS.goldLight}" stroke-width="14" stroke-linejoin="round" stroke-linecap="round"/>
    <line x1="256" y1="170" x2="256" y2="350" stroke="${COLORS.goldLight}" stroke-width="10"/>
    <path d="M226 350 L256 290 L286 350" fill="none" stroke="${COLORS.goldLight}" stroke-width="10" stroke-linecap="round"/>
    <line x1="120" y1="350" x2="392" y2="350" stroke="${COLORS.goldLight}" stroke-width="12" stroke-linecap="round"/>
  `,

  // Podium
  podium: `
    <rect x="180" y="240" width="60" height="120" fill="none" stroke="${COLORS.goldLight}" stroke-width="10"/>
    <text x="210" y="320" font-family="Georgia, serif" font-size="36" font-weight="bold" fill="${COLORS.goldLight}" text-anchor="middle">2</text>
    <rect x="226" y="180" width="60" height="180" fill="none" stroke="${COLORS.goldLight}" stroke-width="10"/>
    <text x="256" y="290" font-family="Georgia, serif" font-size="36" font-weight="bold" fill="${COLORS.goldLight}" text-anchor="middle">1</text>
    <rect x="272" y="280" width="60" height="80" fill="none" stroke="${COLORS.goldLight}" stroke-width="10"/>
    <text x="302" y="340" font-family="Georgia, serif" font-size="36" font-weight="bold" fill="${COLORS.goldLight}" text-anchor="middle">3</text>
    <polygon points="256,130 244,165 268,165" fill="${COLORS.goldLight}"/>
  `,

  // Candle with 1
  candle1: `
    <rect x="220" y="220" width="72" height="140" rx="8" fill="none" stroke="${COLORS.goldLight}" stroke-width="10"/>
    <rect x="246" y="180" width="20" height="50" fill="${COLORS.goldLight}"/>
    <ellipse cx="256" cy="160" rx="20" ry="30" fill="${COLORS.goldLight}"/>
    <text x="256" y="310" font-family="Georgia, serif" font-size="60" font-weight="bold" fill="${COLORS.goldLight}" text-anchor="middle">1</text>
  `,

  // Star with 5
  star5: `
    <polygon points="256,130 275,200 350,200 290,245 310,320 256,275 202,320 222,245 162,200 237,200" fill="none" stroke="${COLORS.goldLight}" stroke-width="12" stroke-linejoin="round"/>
    <text x="256" y="265" font-family="Georgia, serif" font-size="50" font-weight="bold" fill="${COLORS.goldLight}" text-anchor="middle">5</text>
  `,

  // Crown with 10
  crown10: `
    <path d="M160 300 L180 190 L220 250 L256 170 L292 250 L332 190 L352 300 Z" fill="none" stroke="${COLORS.goldLight}" stroke-width="12" stroke-linejoin="round"/>
    <line x1="160" y1="300" x2="352" y2="300" stroke="${COLORS.goldLight}" stroke-width="12" stroke-linecap="round"/>
    <text x="256" y="380" font-family="Georgia, serif" font-size="55" font-weight="bold" fill="${COLORS.goldLight}" text-anchor="middle">10</text>
  `,

  // Snowflake
  snowflake: `
    <line x1="256" y1="140" x2="256" y2="372" stroke="${COLORS.goldLight}" stroke-width="12" stroke-linecap="round"/>
    <line x1="156" y1="198" x2="356" y2="314" stroke="${COLORS.goldLight}" stroke-width="12" stroke-linecap="round"/>
    <line x1="156" y1="314" x2="356" y2="198" stroke="${COLORS.goldLight}" stroke-width="12" stroke-linecap="round"/>
    <line x1="256" y1="180" x2="230" y2="160" stroke="${COLORS.goldLight}" stroke-width="8" stroke-linecap="round"/>
    <line x1="256" y1="180" x2="282" y2="160" stroke="${COLORS.goldLight}" stroke-width="8" stroke-linecap="round"/>
    <line x1="256" y1="332" x2="230" y2="352" stroke="${COLORS.goldLight}" stroke-width="8" stroke-linecap="round"/>
    <line x1="256" y1="332" x2="282" y2="352" stroke="${COLORS.goldLight}" stroke-width="8" stroke-linecap="round"/>
    <circle cx="256" cy="256" r="20" fill="${COLORS.goldLight}"/>
  `,

  // Blossom with arrow
  blossom: `
    <circle cx="256" cy="220" r="25" fill="none" stroke="${COLORS.goldLight}" stroke-width="8"/>
    <circle cx="220" cy="256" r="25" fill="none" stroke="${COLORS.goldLight}" stroke-width="8"/>
    <circle cx="292" cy="256" r="25" fill="none" stroke="${COLORS.goldLight}" stroke-width="8"/>
    <circle cx="230" cy="290" r="25" fill="none" stroke="${COLORS.goldLight}" stroke-width="8"/>
    <circle cx="282" cy="290" r="25" fill="none" stroke="${COLORS.goldLight}" stroke-width="8"/>
    <circle cx="256" cy="256" r="18" fill="${COLORS.goldLight}"/>
    <line x1="256" y1="330" x2="256" y2="380" stroke="${COLORS.goldLight}" stroke-width="10" stroke-linecap="round"/>
    <polygon points="256,370 240,400 272,400" fill="${COLORS.goldLight}" transform="rotate(180 256 385)"/>
  `,

  // Sun with waves
  sunWaves: `
    <circle cx="256" cy="200" r="45" fill="${COLORS.goldLight}"/>
    <line x1="256" y1="120" x2="256" y2="100" stroke="${COLORS.goldLight}" stroke-width="12" stroke-linecap="round"/>
    <line x1="310" y1="146" x2="325" y2="131" stroke="${COLORS.goldLight}" stroke-width="12" stroke-linecap="round"/>
    <line x1="330" y1="200" x2="350" y2="200" stroke="${COLORS.goldLight}" stroke-width="12" stroke-linecap="round"/>
    <line x1="202" y1="146" x2="187" y2="131" stroke="${COLORS.goldLight}" stroke-width="12" stroke-linecap="round"/>
    <line x1="182" y1="200" x2="162" y2="200" stroke="${COLORS.goldLight}" stroke-width="12" stroke-linecap="round"/>
    <path d="M140 300 Q200 270 256 300 Q312 330 372 300" fill="none" stroke="${COLORS.goldLight}" stroke-width="10" stroke-linecap="round"/>
    <path d="M140 350 Q200 320 256 350 Q312 380 372 350" fill="none" stroke="${COLORS.goldLight}" stroke-width="10" stroke-linecap="round"/>
  `,
}

// Get shape from badge key suffix
function getShape(key) {
  if (key.endsWith('_round')) return 'round'
  if (key.endsWith('_hex')) return 'hex'
  if (key.endsWith('_shield')) return 'shield'
  return 'round'
}

// Generate SVG for a badge shape
function generateBaseSVG(shape) {
  const gradients = `
    <defs>
      <!-- Metallic gold rim gradient -->
      <linearGradient id="goldRim" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${COLORS.goldLight}"/>
        <stop offset="30%" stop-color="${COLORS.gold}"/>
        <stop offset="70%" stop-color="${COLORS.goldDark}"/>
        <stop offset="100%" stop-color="${COLORS.gold}"/>
      </linearGradient>

      <!-- Enamel navy gradient (vignette) -->
      <radialGradient id="navyEnamel" cx="40%" cy="35%" r="70%">
        <stop offset="0%" stop-color="${COLORS.navyLight}"/>
        <stop offset="80%" stop-color="${COLORS.navy}"/>
        <stop offset="100%" stop-color="${COLORS.navyDark}"/>
      </radialGradient>

      <!-- Specular highlight -->
      <linearGradient id="specular" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="rgba(255,255,255,0)"/>
        <stop offset="40%" stop-color="rgba(255,255,255,0.25)"/>
        <stop offset="60%" stop-color="rgba(255,255,255,0.25)"/>
        <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
      </linearGradient>

      <!-- Drop shadow filter -->
      <filter id="shadow" x="-10%" y="-10%" width="120%" height="130%">
        <feDropShadow dx="0" dy="8" stdDeviation="8" flood-opacity="0.3"/>
      </filter>
    </defs>
  `

  let shapePaths = ''

  switch (shape) {
    case 'round':
      shapePaths = `
        <!-- Outer rim -->
        <circle cx="256" cy="256" r="230" fill="url(#goldRim)" filter="url(#shadow)"/>
        <!-- Inner rim line -->
        <circle cx="256" cy="256" r="210" fill="none" stroke="${COLORS.goldLight}" stroke-width="2" opacity="0.6"/>
        <!-- Navy enamel face -->
        <circle cx="256" cy="256" r="200" fill="url(#navyEnamel)"/>
        <!-- Specular highlight band -->
        <ellipse cx="200" cy="180" rx="120" ry="60" fill="url(#specular)" transform="rotate(-25 256 256)"/>
      `
      break

    case 'hex':
      // Regular hexagon points
      const hexPoints = []
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 2
        hexPoints.push(`${256 + 230 * Math.cos(angle)},${256 + 230 * Math.sin(angle)}`)
      }
      const innerHexPoints = []
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 2
        innerHexPoints.push(`${256 + 200 * Math.cos(angle)},${256 + 200 * Math.sin(angle)}`)
      }
      shapePaths = `
        <!-- Outer rim -->
        <polygon points="${hexPoints.join(' ')}" fill="url(#goldRim)" filter="url(#shadow)"/>
        <!-- Inner rim line -->
        <polygon points="${innerHexPoints.join(' ')}" fill="none" stroke="${COLORS.goldLight}" stroke-width="2" opacity="0.6"/>
        <!-- Navy enamel face -->
        <polygon points="${innerHexPoints.join(' ')}" fill="url(#navyEnamel)"/>
        <!-- Specular highlight band -->
        <ellipse cx="200" cy="180" rx="100" ry="50" fill="url(#specular)" transform="rotate(-25 256 256)"/>
      `
      break

    case 'shield':
      shapePaths = `
        <!-- Outer rim -->
        <path d="M256 30 L450 120 L450 280 C450 380 256 480 256 480 C256 480 62 380 62 280 L62 120 Z" fill="url(#goldRim)" filter="url(#shadow)"/>
        <!-- Inner rim line -->
        <path d="M256 55 L430 135 L430 275 C430 365 256 455 256 455 C256 455 82 365 82 275 L82 135 Z" fill="none" stroke="${COLORS.goldLight}" stroke-width="2" opacity="0.6"/>
        <!-- Navy enamel face -->
        <path d="M256 60 L425 138 L425 272 C425 358 256 445 256 445 C256 445 87 358 87 272 L87 138 Z" fill="url(#navyEnamel)"/>
        <!-- Specular highlight band -->
        <ellipse cx="200" cy="160" rx="110" ry="50" fill="url(#specular)" transform="rotate(-20 256 256)"/>
      `
      break
  }

  return { gradients, shapePaths }
}

// Generate complete badge SVG
function generateBadgeSVG(badge) {
  const shape = getShape(badge.key)
  const { gradients, shapePaths } = generateBaseSVG(shape)
  const pictogram = PICTOGRAMS[badge.pictogram] || ''

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  ${gradients}
  <g>
    ${shapePaths}
    <!-- Pictogram -->
    <g class="pictogram">
      ${pictogram}
    </g>
  </g>
</svg>`
}

// Generate all badges
console.log('Generating badge SVGs...\n')

for (const badge of BADGES) {
  const svg = generateBadgeSVG(badge)
  const filePath = join(OUTPUT_DIR, `${badge.key}.svg`)
  writeFileSync(filePath, svg)
  console.log(`✓ ${badge.key}.svg`)
}

console.log(`\n✅ Generated ${BADGES.length} badge SVGs in ${OUTPUT_DIR}`)

// Generate manifest
const manifest = {
  version: '1.0.0',
  generated: new Date().toISOString(),
  badges: BADGES.map(b => ({
    icon: b.key,
    name: b.name,
    path: `/badges/${b.key}.svg`,
    shape: getShape(b.key),
  }))
}

const manifestPath = join(__dirname, '../src/assets/badges.manifest.json')
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
console.log(`\n✅ Generated badges.manifest.json`)
