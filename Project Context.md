# MealMe — Project Context Handoff

> Written 2026-03-03. Pass this file to the next AI session as context.

---

## 1. What Is MealMe?

A **mobile-first PWA** (Progressive Web App) that acts as an AI-powered nutrition tracker. Users scan food with their phone camera or speak a query, and Gemini AI returns calorie/macro breakdowns. The app tracks daily macros against personalised targets.

Primary user device: **Android phone (Samsung Galaxy)**. Also tested on iOS.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite 7, Vanilla CSS |
| Backend | Node.js + Express 5 |
| AI | `@google/genai` SDK — **Gemini 3.1 Pro Preview** (vision, voice, text) |
| Database / Auth | Supabase (Postgres + Auth) |
| Icons | `lucide-react` |
| Frontend hosting | **Vercel** (auto-deploys from GitHub `main`) |
| Backend hosting | **Render** — service named `MealMe`, URL: `https://mealme-backend.onrender.com` |

---

## 3. Repository Structure

```
MealMe/
├── .env.production          ← COMMITTED — bakes VITE_API_BASE_URL into Vercel builds
├── .env.local               ← gitignored — local dev only
├── .gitignore
├── index.html
├── vite.config.js
├── package.json             ← frontend deps
├── public/
│   ├── manifest.json        ← PWA manifest
│   └── sw.js                ← service worker
├── src/
│   ├── App.jsx              ← main orchestrator, auth, state
│   ├── App.css
│   ├── main.jsx
│   ├── utils/
│   │   ├── api.js           ← exports API_BASE_URL
│   │   ├── supabase.js      ← Supabase client
│   │   └── calculations.js  ← BMR/TDEE/macro math, parseCoachPlan()
│   ├── data/
│   │   └── mockData.js
│   └── components/
│       ├── Auth.jsx / Auth.css
│       ├── Onboarding.jsx / Onboarding.css
│       ├── Dashboard.jsx / Dashboard.css
│       ├── CameraScanner.jsx / CameraScanner.css
│       ├── AnalysisResults.jsx / AnalysisResults.css
│       ├── VoiceAgent.jsx / VoiceAgent.css
│       ├── Recommendations.jsx / Recommendations.css
│       └── FileUpload.jsx / FileUpload.css
└── server/
    ├── .env                 ← gitignored — GEMINI_API_KEY, SUPABASE_URL, etc.
    ├── index.js             ← Express routes
    ├── package.json
    ├── test-vision.js       ← manual Gemini vision test script
    └── services/
        ├── visionService.js       ← camera image → Gemini
        ├── documentService.js     ← file/PDF → Gemini (used by /api/analyze-file)
        ├── llmKnowledgeService.js ← restaurant LLM queries
        ├── databaseService.js     ← Supabase chain menu lookups
        ├── scraperService.js      ← web menu scraping
        └── correctionService.js   ← AI macro correction
```

---

## 4. Environment Variables

### Frontend (`.env.production` — committed to git)
```
VITE_API_BASE_URL=https://mealme-backend.onrender.com
```
> **Critical:** `.env.local` is gitignored. `.env.production` is NOT gitignored and is the file Vercel reads at build time. `VITE_` prefix means Vite bakes it into the client bundle.

### Backend (`server/.env` — gitignored, set manually on Render)
```
GEMINI_API_KEY=...
SUPABASE_URL=https://rcpmljssaffynhehrcwq.supabase.co
SUPABASE_ANON_KEY=...
PORT=3001
```

---

## 5. Server API Routes (`server/index.js`)

| Route | Service | Purpose |
|---|---|---|
| `GET /api/health` | — | Health check |
| `POST /api/vision` | `visionService.js` | Camera image → food macros |
| `POST /api/database` | `databaseService.js` | Pre-scraped chain restaurant menus |
| `POST /api/llm-knowledge` | `llmKnowledgeService.js` | Restaurant LLM knowledge |
| `POST /api/scrape` | `scraperService.js` | Live menu scraping |
| `POST /api/analyze-file` | `documentService.js` | File/PDF/image upload → macros |
| `POST /api/correct` | `correctionService.js` | AI macro correction |

Express body limit: **50MB** (`express.json({ limit: '50mb' })`).

---

## 6. Gemini Model Usage

All services use `gemini-3.1-pro-preview` as the **primary model**.

- `visionService.js`: single model, **3 auto-retries** on 503/UNAVAILABLE errors (2s then 4s delay). NO fallback to other models (user preference).
- `documentService.js`: tries `gemini-3.1-pro-preview` → falls back to `gemini-1.5-pro` on error.
- Other services: `gemini-3.1-pro-preview` directly.

---

## 7. Component Responsibilities

### `App.jsx`
- Top-level state: auth session, macro plan, consumed macros, meal history, camera open/close, analysis visibility
- `handlePhotoCaptured(mode, backendResponse)` — processes vision API response, shows `AnalysisResults`
- `cameraErrorMsg` state — shows a 6-second dismissable toast when vision fails (replaced old debug `alert()`)
- PWA install prompt handling (Android `beforeinstallprompt` + iOS detection)

### `Dashboard.jsx`
- Shows daily macro targets vs consumed
- **Clickable macro cards** — protein, carbs, fats, AND calories — tap to edit inline
- Editing calories **scales all other macros proportionally** to maintain macro split
- `MacroInlineEditor` component with `unit` and `hint` props

### `CameraScanner.jsx`
- `getUserMedia()` → live camera preview background (aesthetic only)
- `oncanplay` event (NOT `onloadedmetadata`) marks camera ready
- **Capture button**: stops stream → triggers hidden `<input capture="environment">` → native OS camera
- `handleFileSelect` → `compressImage()` (max 1280px, JPEG 0.82, ~500KB) → FileReader → `submitToAPI()`
- `submitToAPI()`: `AbortController` with **45-second timeout**, cancel button shown during scan
- Gallery button: `<input type="file" accept="image/*">` (no capture attribute) → same flow
- Scan modes: `meal` (single food analysis) and `ingredients` (batch ingredient → recipe calculation)
- Scanning screen shows the captured image at 65% opacity behind the animated scan line

### `AnalysisResults.jsx / .css`
- **`position: fixed; inset: 0; z-index: 400`** — MUST be fixed, not absolute (absolute caused panel to appear off-screen when dashboard was scrolled)
- Bottom sheet design with `justify-content: flex-end`

### `Onboarding.jsx`
- Two modes: "Calculate for Me" (4-step flow) and "Import Coach's Plan"
- **Install banner**: detects in-app browsers (Messenger, Instagram, FB, WhatsApp etc.) via UA string, shows iOS/Android install instructions, dismissable
- **Import Coach's Plan**: file upload (`/api/analyze-file`) + text paste fallback
- Textarea uses **hardcoded `color: #ffffff; background: rgba(0,0,0,0.45)`** — CSS variables were not resolved in Messenger's in-app WebView causing black-on-black text
- `parseCoachPlan()` wrapped in try-catch — any parse error silently returns null instead of crashing
- Removed broken `isExtracting` reference (was undeclared variable)

### `VoiceAgent.jsx`
- Push-to-talk voice input → text query → Gemini → food suggestions

### `FileUpload.jsx`
- Used on Dashboard for uploading meal plan files
- Calls `/api/analyze-file` endpoint

---

## 8. Supabase Schema (relevant tables)

- `profiles` — user name, macro plan (calories, protein, carbs, fats, tdee), onboarding status
- `meal_history` — logged meals with macros per user per day
- Auth handled by Supabase Auth (email/password)

---

## 9. PWA Setup

- `public/manifest.json` — app manifest
- `public/sw.js` — service worker
- Install prompt handled in `App.jsx` with `beforeinstallprompt` event

---

## 10. Known Issues & Recent Fixes (this session)

### Fixed ✅
| Issue | Fix |
|---|---|
| Camera scanner infinite "AI analysing" loop | Added AbortController 45s timeout + Cancel button to scanning screen |
| Black frame being sent to Gemini | Switched from `onloadedmetadata` to `oncanplay`; canvas approach abandoned |
| "I'm sorry, I had trouble analysing" error | Root cause: canvas-based capture unreliable → reverted to native file picker |
| Large camera photo payloads | Added `compressImage()` — resizes to ≤1280px before sending |
| Image not showing during scanning | `setPendingImage()` now called before `submitToAPI()` in both meal and ingredient modes |
| Analysis results panel at bottom of screen | Changed `.analysis-overlay` from `position: absolute` to `position: fixed; inset: 0; z-index: 400` |
| VITE_API_BASE_URL not in Vercel builds | Created `.env.production` (not gitignored) with Render URL |
| Gemini 503 "high demand" errors | Added 3-attempt retry loop with 2s/4s backoff in `visionService.js` |
| Onboarding textarea black screen in Messenger | Hardcoded inline styles instead of CSS variables |
| `isExtracting` undeclared variable crash | Removed reference, added try-catch around `parseCoachPlan()` |
| Kcal limit not editable on Dashboard | Made calories card clickable with proportional macro scaling |
| Camera overlay "live stream goes black" before picker | Removed `stopStream()` before file picker click; stream stays live until file returns |

### Known Behaviour
- Render backend may have a **cold start** delay (~5-15s) on first request after inactivity. The 45s AbortController timeout handles this.
- `gemini-3.1-pro-preview` occasionally returns 503 during high demand periods — handled by retry logic.
- The `compressImage()` canvas compression means image quality seen during scanning is slightly lower than the captured photo, but Gemini receives 1280px which is plenty for analysis.

---

## 11. Deployment Flow

```
git push origin main
   ↓
Vercel auto-deploys frontend (reads .env.production)
   ↓
Render auto-deploys backend (reads server/.env set on Render dashboard)
```

Both deploy on every push to `main`. No manual steps needed.

---

## 12. Local Development

```powershell
# Frontend
cd c:\Users\GGPC\Desktop\MealMe
npm run dev    # http://localhost:5173 — reads .env.local

# Backend
cd c:\Users\GGPC\Desktop\MealMe\server
node index.js  # http://localhost:3001 — reads server/.env
```

---

## 13. User Preferences & Decisions

- **No fallback models** in `visionService.js` — user wants Gemini 3.1 Pro Preview only
- Macro editing: changing kcal scales protein/carbs/fats **proportionally** (keeps ratio, adjusts values)
- App language/voice: English
- Design: dark theme, amber/gold (`--primary-light`) accent, glassmorphism panels
- Font: CSS variable `--font-primary` (system-ui based)
- The app is accessed via Messenger links by some users → in-app browser detection is important
