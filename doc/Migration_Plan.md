# ChipHappens — Migration & Implementation Plan

> Last updated: 2026-03-24
> Tech Stack: Next.js (React) · Tailwind CSS · Supabase · Capacitor · billing (RevenueCat/Stripe deferred; structure in Phase 3b)
> Approach: Full migration, phased rollout

---

## Overview

Migrate ChipHappens from a vanilla JS PWA (6 modules, ~3,000 lines, no build tooling) to a
Next.js (React) static-export app with Supabase backend, deployed to GitHub Pages (web/PWA)
and Google Play Store (Android via Capacitor). iOS App Store deferred to a later phase.

The plan is divided into **5 phases**, each producing a shippable milestone:

| Phase | Milestone | Outcome |
|-------|-----------|---------|
| **1** | Framework Migration | Feature-parity with current app, now in Next.js + Tailwind |
| **2** | Backend & Accounts | Supabase auth, cloud storage, offline sync |
| **3** | Social | Groups, leaderboards, analytics, game history |
| **3b** | Entitlements & Notifications | FREE vs PRO gating, billing *structure* (no RC/Stripe yet), push, PRO export |
| **4** | Distribution | Google Play listing, iOS PWA polish, (future: App Store) |

---

## Phase 1 — Framework Migration

**Goal:** Reproduce the current app in Next.js with zero feature regression. No backend yet.
All data stays in localStorage/IndexedDB as it does today.

### Step 1.1 — Project Scaffolding

- Initialize Next.js project with `npx create-next-app@latest` (App Router, TypeScript, Tailwind CSS, ESLint)
- Configure `next.config.js`: `output: 'export'`, `basePath: '/poker_payout_calculator'`
- Install dependencies: `next-pwa` (or `@ducanh2912/next-pwa`), `dexie` (for later)
- Set up folder structure:

```
/
├── public/
│   ├── icons/
│   │   ├── app_icon.png          ← copy from app/icons/
│   │   ├── feature_graphic.png
│   │   └── splash_screen.png
│   └── manifest.webmanifest      ← updated paths
├── src/
│   ├── app/
│   │   ├── layout.tsx            ← root layout (dark theme, Montserrat font, nav)
│   │   ├── page.tsx              ← payout calculator page
│   │   ├── side-pot/
│   │   │   └── page.tsx          ← side pot calculator page
│   │   ├── settings/
│   │   │   └── page.tsx          ← settings (or keep as modal, see 1.5)
│   │   └── globals.css           ← Tailwind base + custom tokens
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppShell.tsx      ← .wrap, nav, hamburger menu, footer
│   │   │   ├── NavMenu.tsx       ← hamburger dropdown
│   │   │   └── Toast.tsx         ← toast notification component
│   │   ├── payout/
│   │   │   ├── PayoutTable.tsx   ← table container + add row
│   │   │   ├── PayoutRow.tsx     ← single player row (name, ±, in, out, payout)
│   │   │   ├── SettlementPanel.tsx ← banker/greedy settlement display
│   │   │   └── ShareButton.tsx   ← share URL generation
│   │   ├── sidepot/
│   │   │   ├── SidePotTable.tsx  ← bet entry table
│   │   │   ├── SidePotRow.tsx    ← single player bet row
│   │   │   ├── PotDisplay.tsx    ← calculated pots + winner checkboxes
│   │   │   └── WinningsPanel.tsx ← winnings distribution display
│   │   └── settings/
│   │       ├── SettingsModal.tsx  ← hub modal with 3 sub-panels
│   │       ├── ProfilePanel.tsx
│   │       ├── UsualSuspectsPanel.tsx
│   │       └── GameDefaultsPanel.tsx
│   ├── lib/
│   │   ├── calc/
│   │   │   ├── payout.ts         ← pure payout logic (extracted)
│   │   │   ├── sidepot.ts        ← pure side pot logic (extracted)
│   │   │   ├── settlement.ts     ← greedy settlement algorithm (extracted)
│   │   │   └── formatting.ts     ← parseNum, fmt, fmtInt (shared, deduplicated)
│   │   ├── sharing/
│   │   │   ├── compression.ts    ← compressString, decompressToString (deduplicated)
│   │   │   ├── encoding.ts       ← toBase64Url, fromBase64Url (deduplicated)
│   │   │   ├── payout-share.ts   ← payout encode/decode share data
│   │   │   └── sidepot-share.ts  ← sidepot encode/decode share data
│   │   ├── storage/
│   │   │   ├── local-storage.ts  ← localStorage wrappers (poker-payout:v1, etc.)
│   │   │   └── settings-store.ts ← settings load/save (adapted from current)
│   │   ├── payments/
│   │   │   └── revolut.ts        ← buildRevolutLink
│   │   ├── constants.ts          ← USUAL_SUSPECTS, DEFAULT_USUAL_SUSPECTS
│   │   └── types.ts              ← TypeScript interfaces for all data models
│   └── hooks/
│       ├── usePayoutCalculator.ts  ← React state + recalc logic
│       ├── useSidePotCalculator.ts ← React state + pot calculation logic
│       ├── useSettings.ts          ← settings state + persistence
│       ├── useLocalStorage.ts      ← generic localStorage hook
│       └── useToast.ts             ← toast notification hook
├── tailwind.config.ts
├── next.config.js
├── tsconfig.json
├── package.json
└── capacitor.config.ts            ← added in Phase 4
```

### Step 1.2 — Extract Pure Business Logic

Extract and deduplicate functions from the current codebase into `src/lib/`. These are
pure functions (no DOM access) and can be ported almost verbatim, with TypeScript types added.

| Source (current) | Destination (new) | Functions |
|------------------|--------------------|-----------|
| `payout_calc.js` lines ~60–120 | `lib/calc/settlement.ts` | `computeGreedyTransactions(balances)` |
| `payout_calc.js` recalc logic | `lib/calc/payout.ts` | `calculatePayouts(rows)`, `validateBalance(rows)` |
| `sidepot_calc.js` calculateSidePots | `lib/calc/sidepot.ts` | `calculateSidePots(players, initialPot)` — refactored to accept data params instead of reading DOM |
| Both files (duplicated) | `lib/calc/formatting.ts` | `parseNum(v)`, `fmt(n)`, `fmtInt(n)` |
| Both files (duplicated) | `lib/sharing/compression.ts` | `compressString(value)`, `decompressToString(bytes)` |
| Both files (duplicated) | `lib/sharing/encoding.ts` | `toBase64Url(bytes)`, `fromBase64Url(str)` |
| `payout_calc.js` | `lib/sharing/payout-share.ts` | `encodePayoutShareData(data)`, `decodePayoutShareData(encoded)` |
| `sidepot_calc.js` | `lib/sharing/sidepot-share.ts` | `encodeSidePotShareData(data)`, `decodeSidePotShareData(encoded)` |
| `payout_calc.js` | `lib/payments/revolut.ts` | `buildRevolutLink(revtag, amount, currency)` |
| `shared-data.js` | `lib/constants.ts` | `USUAL_SUSPECTS`, `DEFAULT_USUAL_SUSPECTS` |
| `settings-store.js` | `lib/storage/settings-store.ts` | `normalizeSettingsData()`, `loadSettingsData()`, `saveSettingsData()` — keep dual-backend (File System Access API + localStorage) |

### Step 1.3 — Define TypeScript Interfaces

Create `src/lib/types.ts`:

- `PayoutRow` — `{ id, name, buyIn, cashOut, payout, settled, revtag? }`
- `SidePotPlayer` — `{ id, name, bet }`
- `SidePot` — `{ name, size, eligiblePlayers, winners }`
- `Transaction` — `{ from, to, amount }`
- `SettingsData` — `{ profile, usualSuspects, gameSettings }`
- `Profile` — `{ name, revtag }`
- `UsualSuspect` — `{ name, revtag }`
- `GameSettings` — `{ currency, defaultBuyIn, settlementMode }`

### Step 1.4 — Build React Components (Payout Calculator)

Port `payout_calc.js` (1,186 lines of DOM manipulation) → React components + hooks:

1. **`usePayoutCalculator` hook** — manages `rows` state array, `addRow()`, `removeRow()`,
   `updateRow()`, `recalc()`, auto-save to localStorage on every change, restore on mount,
   share URL decode on mount if `?s=` param present
2. **`PayoutTable`** — renders `<table>`, maps `rows` → `<PayoutRow>`, toolbar (add/reset/share),
   settlement mode toggle (banker/greedy)
3. **`PayoutRow`** — single `<tr>` with controlled inputs: name (with autocomplete from usual
   suspects), ±step buttons, buy-in, cash-out, payout display, settle checkbox, delete button
4. **`SettlementPanel`** — displays computed transactions (greedy) or banker summary, with
   Revolut payment links
5. **`ShareButton`** — calls `encodePayoutShareData()`, copies URL to clipboard, shows toast

### Step 1.5 — Build React Components (Side Pot Calculator)

Port `sidepot_calc.js` (962 lines) → React components + hooks:

1. **`useSidePotCalculator` hook** — manages `players` state, `boards` (1 or 2), `initialPot`,
   `addPlayer()`, `removePlayer()`, `calculatePots()`, winner selection state per pot per board
2. **`SidePotTable`** — player entry table with bet inputs
3. **`SidePotRow`** — single player: name + bet input
4. **`PotDisplay`** — rendered pots with per-pot winner checkboxes (1 or 2 boards)
5. **`WinningsPanel`** — per-player winnings, total won display

### Step 1.6 — Build Settings Components

Port `settings.js` (537 lines) + `settings-store.js` (233 lines):

1. **`useSettings` hook** — loads/saves settings, provides settings context to entire app
2. **`SettingsModal`** — hub with tabs/sections: Profile, Usual Suspects, Game Defaults
3. **`ProfilePanel`** — name + revtag inputs
4. **`UsualSuspectsPanel`** — CRUD list of players with revtags
5. **`GameDefaultsPanel`** — currency, default buy-in, settlement mode selectors
6. **Import/Export** — keep File System Access API on desktop, file input + download link on mobile

### Step 1.7 — Shared Layout & Navigation

1. **`AppShell`** — dark background (`#09090b`), Montserrat font (via `next/font/google`),
   responsive `.wrap` container
2. **`NavMenu`** — hamburger menu with links: Payout Calculator, Side Pot Calculator, Settings
3. **`Toast`** — notification component with slide-in/fade-out animation
4. **Footer** — version text

### Step 1.8 — Styling Migration (CSS → Tailwind)

- Migrate `styles.css` (~400 lines) to Tailwind utility classes in components
- Define design tokens in `tailwind.config.ts`:
  - Colors: `bg: '#09090b'`, `panel: '#18181b'`, `accent: '#d4a832'`, `ok: '#d4a832'`, `warn: '#ef4444'`
  - Font: Montserrat
  - Radius: `lg: 8px`
  - Spacing: `sm: 8px`, `md: 12px`, `lg: 16px`
- Preserve dark-mode-only design, high contrast, large tap targets

### Step 1.9 — PWA Configuration

- Configure `next-pwa` plugin for service worker generation (Workbox under the hood)
- Pre-cache all static assets (automatic with next-pwa)
- Network-first for pages, cache-first for static assets (match current sw.js behavior)
- Update `manifest.webmanifest` with correct paths for Next.js static export
- Verify: Add to Home Screen on iOS Safari + Android Chrome

### Step 1.10 — Share URL Backward Compatibility

- Decode logic must handle both old format (`?s=zXXX` / `?s=jXXX`) and new format
- Encode logic produces same format (gzip + base64url) so old links still work
- Test: old share URLs generated by current app must open correctly in new app

### Step 1.11 — Verification (Phase 1)

- [ ] Payout calculator: add/remove rows, recalc, settle, greedy/banker modes
- [ ] Side pot calculator: add/remove players, multi-board, winner selection, winnings
- [ ] Settings: profile, usual suspects, game defaults, import/export
- [ ] Share URLs: generate and decode (including old-format backward compat)
- [ ] Revolut payment links work
- [ ] localStorage persistence: refresh browser → state restored
- [ ] PWA: installable on Android Chrome, Add to Home Screen on iOS Safari
- [ ] Offline: airplane mode → app loads, calculator works, data persists
- [ ] Responsive: works on mobile (< 480px), tablet (< 768px), desktop
- [ ] Accessibility: keyboard navigation, screen reader basics
- [ ] `npm run build && npx serve out` → static export runs correctly

**Estimated effort: 2–3 weeks**

---

## Phase 2 — Backend & Accounts

**Goal:** Add Supabase backend, user accounts, cloud storage, and offline sync.
App works identically without an account (local-only mode preserved).

### Step 2.1 — Supabase Project Setup

- Create Supabase project
- Configure environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Install `@supabase/supabase-js`

### Step 2.2 — Database Schema

Design PostgreSQL tables:

```sql
profiles
  id              UUID PK (= auth.users.id)
  display_name    TEXT
  revtag          TEXT
  pro_unlocked_at TIMESTAMPTZ NULL  -- PRO (one-time); set manually in early phases, billing webhook later
  pro_unlock_source TEXT NULL       -- e.g. 'manual', 'revenuecat', 'stripe' (optional)
  created_at      TIMESTAMPTZ
  updated_at      TIMESTAMPTZ

groups
  id              UUID PK
  name            TEXT
  currency        TEXT DEFAULT 'EUR'
  default_buy_in  TEXT DEFAULT '30'
  settlement_mode TEXT DEFAULT 'greedy'
  created_by      UUID FK → profiles.id
  created_at      TIMESTAMPTZ

group_members
  group_id        UUID FK → groups.id
  user_id         UUID FK → profiles.id
  joined_at       TIMESTAMPTZ
  PK (group_id, user_id)

game_sessions
  id              UUID PK
  created_by      UUID FK → profiles.id
  group_id        UUID FK → groups.id
  session_date    DATE
  currency        TEXT
  default_buy_in  TEXT
  settlement_mode TEXT
  status          TEXT ('active', 'settled')
  share_code      TEXT (for share URLs)
  created_at      TIMESTAMPTZ
  updated_at      TIMESTAMPTZ

game_players
  id              UUID PK
  session_id      UUID FK → game_sessions.id
  user_id         UUID FK → profiles.id (nullable — guests)
  player_name     TEXT
  buy_in          NUMERIC
  cash_out        NUMERIC
  net_result      NUMERIC (computed: cash_out - buy_in)
  settled         BOOLEAN DEFAULT false
  created_at      TIMESTAMPTZ
```

### Step 2.3 — Row-Level Security (RLS)

- `profiles`: users can read/update only their own row
- `groups`: creator can CRUD; group members can read (added in Phase 3)
- `group_members`: users can CRUD their own membership
- `game_sessions`: creator can CRUD; group members can read (added in Phase 3)
- `game_players`: session creator can CRUD; the linked user can read their own records

### Step 2.4 — Authentication

- Implement Supabase Auth: email/password sign-up, sign-in, sign-out, password reset
- Social login: Google (covers most users; Apple login added in Phase 4 for App Store)
- Create `src/lib/auth/` with auth context provider
- Build UI: sign-in/sign-up modal or page, account menu in nav
- On sign-up: create `profiles` row, migrate localStorage data to Supabase

### Step 2.5 — Data Layer Abstraction

Create `src/lib/data/` — a unified data access layer that routes to local or cloud:

```
src/lib/data/
  ├── repository.ts        ← interface: getSettings(), saveGameSession(), etc.
  ├── local-repository.ts  ← implements via localStorage/IndexedDB (Dexie)
  ├── cloud-repository.ts  ← implements via Supabase client
  └── sync-repository.ts   ← wraps both: writes to local, syncs to cloud
```

- **Not logged in:** uses `local-repository` only
- **Logged in + online:** writes to both local + cloud (local as cache)
- **Logged in + offline:** writes to local, queues for sync

### Step 2.6 — Offline Sync Engine

Install `dexie` for structured IndexedDB storage:

```
src/lib/sync/
  ├── sync-engine.ts       ← monitors navigator.onLine, processes queue
  ├── sync-queue.ts        ← Dexie table of pending mutations {id, table, operation, payload, timestamp}
  └── conflict-resolver.ts ← last-write-wins based on updated_at timestamps
```

- Every cloud-bound write also creates a sync queue entry
- On connectivity restored (`online` event): process queue in order, POST to Supabase
- On conflict: compare `updated_at` timestamps, keep newer
- On app open (if logged in + online): pull latest from Supabase → update local Dexie cache

### Step 2.7 — Local-to-Cloud Migration

When a localStorage-only user creates an account:
1. Read all data from `poker-payout:v1`, `poker-sidepot:v1`, `poker-calc-settings`
2. Transform to Supabase schema
3. Insert into cloud tables
4. Mark local data as "migrated"
5. Switch data layer to `sync-repository`

### Step 2.8 — Verification (Phase 2)

- [ ] Sign up, sign in, sign out, password reset
- [ ] Settings saved to Supabase and restored on new device
- [ ] Game session saved to cloud on settle
- [ ] App works fully without account (local-only mode unchanged)
- [ ] Offline mode: create game → go offline → settle → go online → data syncs
- [ ] Local data migration on account creation
- [ ] RLS: user A cannot read user B's data

**Estimated effort: 2–3 weeks**

---

## Phase 3 — Social Features

**Goal:** Groups, leaderboards, analytics, game history. No entitlements or push yet.

**Access note:** Phase 3 implements these capabilities in the product; **which capabilities are FREE vs PRO** is defined in Phase 3b. After Phase 3b, groups, cross-session stats, unlimited history, and export are PRO-only unless the user has unlocked PRO (see Phase 3b matrix).

### Step 3.1 — Database Schema Extension

```sql
groups
  id              UUID PK
  name            TEXT
  created_by      UUID FK → profiles.id
  invite_code     TEXT UNIQUE (short shareable code)
  created_at      TIMESTAMPTZ

group_members
  group_id        UUID FK → groups.id
  user_id         UUID FK → profiles.id
  role            TEXT ('admin', 'member')
  joined_at       TIMESTAMPTZ
  PK (group_id, user_id)

-- Update game_sessions: group_id FK becomes active
-- Update game_players: user_id FK used for linking results to player profiles

player_stats (materialized view or computed on read)
  user_id         UUID
  group_id        UUID (nullable — overall stats if null)
  total_sessions  INT
  total_profit    NUMERIC
  biggest_win     NUMERIC
  biggest_loss    NUMERIC
  win_count       INT
  loss_count      INT
  avg_profit      NUMERIC
  last_played     DATE
```

### Step 3.2 — Groups Feature

- Create/join/leave groups
- Invite via shareable link (`/join/INVITE_CODE`)
- Group admin can remove members
- Link game sessions to groups
- RLS: group members can read group's game sessions

Build components:
- `GroupList` — user's groups
- `GroupDetail` — members, recent games, leaderboard
- `CreateGroupModal`
- `InviteLinkButton`

### Step 3.3 — Game History & PnL

- `HistoryPage` — list of past game sessions with filters (date range, group, stakes)
- `PnLChart` — line chart of cumulative profit over time (Chart.js or Recharts)
- `SessionDetail` — expanded view of a past game (all players, payouts, transactions)

### Step 3.4 — Leaderboards & Statistics

- `LeaderboardPage` — group rankings: total profit, sessions, win rate
- `StatsPage` — personal statistics dashboard (avg profit, biggest win/loss, streaks)
- Time period selector: all time, last 30 days, last 90 days, this year
- Computed server-side via Supabase SQL functions or Edge Functions for performance

### Step 3.5 — Verification (Phase 3)

- [x] Create group, invite via link, member joins
- [x] Game settled → results appear in all participants' history
- [x] PnL chart renders correctly with historical data
- [x] Leaderboard shows correct rankings within group
- [x] History page: filters (date range, group, stakes) work
- [x] Session detail view shows correct players, payouts, transactions
- [x] RLS: group members can read group's sessions; non-members cannot

**Estimated effort: 2–3 weeks**

---

## Phase 3b — Entitlements & Notifications

**Goal:** Implement a **feature gating** system (FREE vs PRO), **prepare** the codebase and schema for one-time PRO unlock via billing (RevenueCat/Stripe) **without** shipping that integration yet. Add push notifications and a PRO-only **CSV-ready export** endpoint.

**Monetization model:** PRO is a **one-time unlock** (not a subscription). Until billing ships, PRO can be toggled via `profiles` (e.g. manual flag for QA) or a dev-only override.

### FREE vs PRO matrix (source of truth)

| Tier | Scope |
|------|--------|
| **FREE** | Create sessions; add players; track buy-ins and payouts; calculate final payouts; **save up to 10 most recent sessions**; **view per-session results** (who won/lost). |
| **PRO** (one-time unlock) | **Unlimited** saved sessions; **lifetime stats**: `total_profit`, `win_rate`, `average_buy_in`; **player insights**: `profit_vs_player`, leaderboard **across sessions**; **create and manage groups**; **profit over time** (basic time-series); **export data** (CSV-ready API endpoint). |

Implementation detail: enforce limits in **API/RLS + client** (e.g. cap list queries at 10 for FREE; hide or 403 PRO-only routes and UI).

### Step 3b.1 — Entitlements & Feature Gates

Create `src/lib/entitlements/`:

- `types.ts` — `EntitlementTier = 'free' | 'pro'`, feature flags derived from tier (single source of truth aligned with the matrix above)
- `resolveTier.ts` — reads `profiles.pro_unlocked_at`; returns `'pro'` if set, else `'free'` (billing adapters populate this field later)
- `featureFlags.ts` — maps tier → booleans (`canUnlimitedSessions`, `canLifetimeStats`, `canGroups`, `canExport`, …)
- `PaidFeatureGate` (or `ProFeatureGate`) — wraps PRO UI; shows upgrade CTA when FREE
- `UpgradeModal` — explains PRO benefits; **primary CTA is a placeholder** (“Unlock PRO — coming soon”) until post–Phase 3b billing work (Step 3b.2 skeleton only in 3b)

**Database:** use `profiles.pro_unlocked_at` / `pro_unlock_source` from Phase 2; tier = PRO iff `pro_unlocked_at IS NOT NULL`.

RLS / Edge Functions: FREE users cannot list or aggregate beyond allowed scope (e.g. >10 sessions, cross-session analytics, groups, export).

### Step 3b.2 — Billing integration structure (deferred — no RevenueCat/Stripe in this phase)

**Do not** add RevenueCat or Stripe SDKs or production webhooks yet. **Do** add the skeleton so wiring is a small follow-up:

- `src/lib/billing/` (or `src/lib/entitlements/billing/`):
  - `README.md` — one page: planned flow (web vs Android), env vars, webhook URL shape
  - `types.ts` — `BillingProvider`, `PurchaseEvent`, `EntitlementSyncPayload`
  - `noop-adapter.ts` — `syncEntitlementsFromBilling(): Promise<void>` no-op (or reads nothing) until real adapter exists
- Supabase: reserved Edge Function path/name (e.g. `billing-webhook`) — **stub** that returns 501 or logs only; document expected payload for future RevenueCat/Stripe
- Document in `profiles` which fields billing will set (`pro_unlocked_at`, optional receipt metadata column later)

**Later phase (not 3b):** RevenueCat (`@revenuecat/purchases-js`, `@revenuecat/purchases-capacitor`) and/or Stripe (web); webhook → Edge Function → set `pro_unlocked_at`; client refresh tier after purchase.

### Step 3b.3 — Push Notifications

- Supabase Edge Function to send FCM messages
- Notification triggers:
  - Group invitation received
  - Game session settled (summary to all participants)
  - Settlement reminder (unpaid debts after 24h/48h)
- User preferences stored in `profiles` table (notification_prefs JSONB)
- Capacitor `@capacitor/push-notifications` plugin for Android native push
- Web Push API for browser (best-effort)

*(Optional policy: restrict some notification types to PRO only — only if product wants it; default can be same for all authenticated users.)*

### Step 3b.4 — PRO data export (CSV-ready endpoint)

- **Edge Function** (or authenticated API route pattern compatible with static export): returns **CSV-ready** data (correct `Content-Type` / download headers) for the signed-in user’s sessions and players — **PRO only** (403 for FREE)
- Client: “Export” action visible only when tier is PRO; triggers download
- **Out of scope for 3b:** PDF export, full GDPR bundle (can be a later compliance milestone)

### Step 3b.5 — Verification (Phase 3b)

- [ ] FREE user: can create sessions, players, buy-ins/payouts, final payouts; history capped at **10** sessions; per-session results visible for allowed sessions
- [ ] FREE user: blocked from PRO surfaces (unlimited history, lifetime stats, player insights, cross-session leaderboard, groups, profit-over-time, export) with clear upgrade path
- [ ] PRO user (e.g. `pro_unlocked_at` set manually): unlimited sessions; lifetime stats + player insights + groups + time-series + export work
- [ ] `src/lib/billing/` skeleton + webhook stub exist; no production payment SDKs required for this checklist
- [ ] Push notification received on Android for group invite (where applicable)
- [ ] Push preferences saved and respected
- [ ] CSV export endpoint returns correct data for PRO; FREE receives 403

**Estimated effort: 2–3 weeks**

---

## Phase 4 — Distribution & Polish

**Goal:** Ship to Google Play Store. Polish PWA for iOS. Prepare for future App Store.

### Step 4.1 — Internationalization (i18n)

- Install `next-intl` or `react-i18next`
- Extract all hardcoded strings → JSON resource files (`en.json`, `tr.json`, `de.json`)
- Locale-aware number/currency formatting via `Intl.NumberFormat`
- Language selector in settings, auto-detect from browser

### Step 4.2 — Accessibility Audit

- Run axe-core / Lighthouse accessibility audit
- Fix all WCAG 2.1 AA violations
- Verify with VoiceOver (iOS) and TalkBack (Android)
- Ensure all tap targets ≥ 44×44px
- Keyboard navigation through all flows

### Step 4.3 — Capacitor Setup (Android)

```bash
npm install @capacitor/core @capacitor/cli
npx cap init "ChipHappens" "com.chiphappens.app"
npx cap add android
```

- Configure `capacitor.config.ts`: `webDir: 'out'`, server URL for dev
- Install Capacitor plugins: `@capacitor/push-notifications`, `@capacitor/preferences`
  - Add `@revenuecat/purchases-capacitor` when billing integration ships (after Phase 3b)
- `npx cap sync` after every `npm run build`

### Step 4.4 — Android Build & Play Store

- Open Android project in Android Studio (`npx cap open android`)
- Configure signing keys (release keystore)
- Set up app listing: screenshots, description, feature graphic, privacy policy URL
- Google Play Console: create app, upload AAB, configure in-app products
- Internal testing → Closed testing → Production release

### Step 4.5 — GitHub Pages Deployment (CI/CD)

- Create `.github/workflows/deploy.yml`:
  - Trigger: push to `main`
  - Steps: checkout → setup Node 20 → `npm ci` → `npm run build` → deploy `out/` to GH Pages
- Configure GitHub repo: Settings → Pages → Source: GitHub Actions

### Step 4.6 — iOS PWA Polish

- Test thoroughly on iOS Safari (iPhone + iPad)
- Verify: standalone mode, splash screen, status bar styling, safe area insets
- Verify: offline mode works on iOS (service worker registration quirks)
- Add Apple-specific meta tags: `apple-mobile-web-app-capable`,
  `apple-mobile-web-app-status-bar-style`, apple touch icons

### Step 4.7 — (Future) iOS App Store

When ready:
```bash
npx cap add ios
npx cap sync
```
- Open in Xcode, configure signing + provisioning
- Add `@revenuecat/purchases-capacitor` and StoreKit configuration when billing ships
- Configure APNs for push notifications
- Apple requires: Sign in with Apple (if offering social login), privacy nutrition labels
- Submit for review

### Step 4.8 — Verification (Phase 4)

- [ ] Android APK installs and runs from Play Store (internal testing track)
- [ ] In-app purchase completes on Android (sandbox) — when billing integration is added post–Phase 3b
- [ ] Push notifications work on Android device
- [ ] GitHub Pages deployment: push to main → site updates
- [ ] iOS Safari PWA: Add to Home Screen → offline works → calculator works
- [ ] i18n: switch language → all strings update
- [ ] Lighthouse score: Performance ≥ 90, Accessibility ≥ 90, PWA ≥ 90

**Estimated effort: 2–3 weeks**

---

## Summary Timeline

| Phase | Duration | Cumulative |
|-------|----------|------------|
| Phase 1 — Framework Migration | 2–3 weeks | 2–3 weeks |
| Phase 2 — Backend & Accounts | 2–3 weeks | 4–6 weeks |
| Phase 3 — Social | 2–3 weeks | 6–9 weeks |
| Phase 3b — Entitlements & Notifications | 2–3 weeks | 8–12 weeks |
| Phase 4 — Distribution & Polish | 2–3 weeks | 10–15 weeks |
| **Total** | | **~10–15 weeks** |

Estimates assume a single developer working part-time (~20 hrs/week). Full-time would be roughly half.

---

## Tech Stack Reference

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 15.x |
| Language | TypeScript | 5.x |
| Styling | Tailwind CSS | 4.x |
| State (local) | React hooks + Context | — |
| Local DB | Dexie.js (IndexedDB) | 4.x |
| Backend | Supabase (Postgres 15) | Hosted |
| Auth | Supabase Auth | Hosted |
| Realtime | Supabase Realtime | Hosted |
| Server Functions | Supabase Edge Functions (Deno) | Hosted |
| Native Wrapper | Capacitor | 6.x |
| Push | FCM + @capacitor/push-notifications | — |
| IAP / PRO unlock | Deferred (RevenueCat / Stripe) | Structure in Phase 3b; SDKs in a later milestone |
| Charts | Chart.js (or Recharts) | — |
| i18n | next-intl (or react-i18next) | — |
| PWA | next-pwa | — |
| Hosting (web) | GitHub Pages (static export) | — |
| Hosting (Android) | Google Play Store | — |
| CI/CD | GitHub Actions | — |

---

## Decisions Log

| Decision | Chose | Over | Reason |
|----------|-------|------|--------|
| Framework | Next.js (React) | SvelteKit, Vue/Nuxt | Largest ecosystem, best Supabase integration, most AI assistance quality |
| Rendering | Static export | SSR | GitHub Pages hosting, no server needed (Supabase handles all backend) |
| Backend | Supabase | Firebase, custom | Relational data (SQL), open-source, built-in auth + realtime + RLS |
| IAP | RevenueCat / Stripe (planned) | Direct StoreKit/Play Billing | Cross-platform entitlement sync, receipt validation; **integration deferred** after Phase 3b entitlements exist |
| Offline storage | Dexie (IndexedDB) | localStorage only | Structured data, larger capacity, better query support for sync queue |
| CSS | Tailwind | Custom CSS | Matches existing Design Guidelines, faster development, built-in responsive |
| Deployment | GitHub Pages + GH Actions | Vercel | Free, already using GitHub, static export sufficient |
| Android | Capacitor | TWA / React Native | Single codebase, web-first, same JS/TS code runs everywhere |
| Phase 1 approach | Full migration | Incremental wrapper | Clean architecture from start; avoids tech debt of wrapping vanilla JS in React |
