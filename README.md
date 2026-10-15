# سنتر النخبة التعليمي — Attendance, Billing & Parent Notifications

Next.js 15 (App Router) · TypeScript · Tailwind CSS (RTL, Arabic-first) · Prisma + PostgreSQL · html5-qrcode · exceljs · lucide-react · Offline-first PWA (Service Worker + IndexedDB)

## Quick start

```bash
cp .env.example .env            # set DATABASE_URL and ADMIN_PASSWORD
docker compose up -d            # local PostgreSQL 16
npm install
npm run db:migrate              # apply prisma/migrations to the local DB
npm run db:seed                 # demo data: 3 students, 6 subject cards NOH-1001..1006
npm run build && npm start      # the service worker (offline mode) is only registered in production builds
```

> **The camera needs HTTPS.** Browsers only allow `getUserMedia` on `https://` or `localhost`. The same goes for
> service workers. For phones on the LAN, use a tunnel (e.g. `cloudflared tunnel --url http://localhost:3000`) or deploy.

## Data model: one student, N subjects, one card per subject

```
Student (name, phone, parent WhatsApp)  ← shared by all the student's cards
  └─ Enrollment (student × group/subject, unique)       active=false when the subject is dropped
       ├─ QrCard        exactly one ACTIVE per enrollment; old ones REVOKED (never reusable)
       ├─ Payment       one row per month  → payment status is PER SUBJECT
       └─ Attendance    unique (enrollment, day) + unique clientId → idempotent scans & syncs
```

Scanning a card resolves `QrCard → Enrollment`, so a single scan identifies **both the student and the subject**.
That's why the scanner has no session picker.

## Offline mode

```
 scan ─► performScan()  (src/lib/offline/scan.ts)
          │ online?  POST /api/scan  {code, clientId(uuid), scannedAt}   ── 3.5s timeout
          │   └─ network error / timeout / 5xx ─┐
          ▼                                     ▼
       server result                     evaluateOffline():
                                           IndexedDB snapshot → GREEN/AMBER/RED instantly
                                           duplicate-today check, revoked-card check
                                           enqueue {clientId, code, enrollmentId, scannedAt}
                                                │
 Sync Manager (src/lib/offline/sync.ts) ◄───────┘
   triggers: `online` event · /api/health probe every 15s · tab visible · tap on the status pill
             · Background Sync in public/sw.js (Chromium, works even with the tab closed)
   flush(): oldest-first batches of 200 → POST /api/attendance/sync
            per item: created | duplicate | rejected → removed from the queue
            network/5xx failure → queue kept, retried later
```

- **No duplicates, ever.** The server dedupes by `clientId`, which covers retries and replays (including the page and
  the service worker syncing at the same moment). It also dedupes by `(enrollment, day)`, which covers two devices
  scanning the same card.
- **Timestamps are preserved.** `scannedAt` comes from the device, and the day and month are derived from it in
  Cairo time. Device clocks ahead of the server are clamped to now. Scans older than 35 days are rejected.
- **Lost cards stay lost offline.** The snapshot carries recently revoked codes. When syncing, a card revoked
  *after* the offline scan still counts, and one revoked *before* is rejected.
- **"Online" is detected properly.** It means `navigator.onLine` **and** `/api/health` (server + DB) reachable.
  Wi-Fi without internet, or a down database, both count as offline.
- **Parent notifications for offline scans.** If auto-send is enabled, they go out when the sync lands, using the
  original scan time in the message.
- **The page shell works offline.** Pages are network-first with a 3.5 s fallback to cache. `/_next/static` assets
  are cache-first. `/api/*` is never cached.

The status pill at the top of every screen shows the state: `● متصل` / `● جاري المزامنة (n)` /
`● غير متصل (n مسح في الانتظار)`. Tap it to sync now.

## Screens

| Route | Purpose |
|---|---|
| `/` | **Dashboard**: enrolled students, today's attendance rate, unpaid subjects, sync status, 7-day trend, per-subject attendance, live scan feed |
| `/scan` | **Scan Hub**: camera + USB/Bluetooth reader (works without focusing anything) + inline "forgot card" search; big green/amber/red result with payment & parent-notification status; full-screen mode; works offline |
| `/students` | Directory: search by name, phone, card code **or subject**; per-subject card · attendance · payment (click to toggle); one-step enrollment modal; Excel export |
| `/groups` | Subjects & groups: fees, sessions/month, enrolled counts, archive/restore |
| `/payments` | Monthly billing ledger per subject: inline status, bulk "mark paid", month picker, Excel export |
| `/reports` | Attendance log with date presets, subject/student filters, Excel export |
| `/settings` | WhatsApp gateway + message templates with live preview |

Keyboard: **Ctrl/⌘ K** opens global search (students & pages, works offline from the device snapshot). On the scan hub: **/** focuses the search, **Esc** = next scan.

## Folder structure

```
nokhba-attendance/
├─ prisma/schema.prisma · migrations/ · seed.ts
├─ public/sw.js · icon.svg            # service worker: shell cache + Background Sync
├─ src/
│  ├─ middleware.ts                   # HTTP Basic admin gate (ADMIN_PASSWORD)
│  ├─ app/
│  │  ├─ page.tsx                     # dashboard
│  │  ├─ scan/ · students/ · groups/ · payments/ · reports/ · settings/
│  │  └─ api/
│  │     ├─ scan/                     POST card scan / manual attendance (idempotent by clientId)
│  │     ├─ attendance/ · /sync · /export      log (+range summary) · bulk offline sync · .xlsx
│  │     ├─ students/ · /[id] · /export        directory · full-state PUT · .xlsx (2 sheets)
│  │     ├─ enrollments/[id]/card · /payment   replace ONE subject's card · set its payment
│  │     ├─ payments/ · /export                monthly ledger + totals · .xlsx
│  │     ├─ dashboard/ · stats/ · groups/ · cards/check/ · offline/snapshot/ · health/ · settings/ · whatsapp/
│  ├─ components/
│  │  ├─ shell/                       # AppShell (sidebar, top bar, mobile tab bar), CommandPalette, SyncStatus, nav
│  │  ├─ students/                    # StudentFormModal (one-step enrollment), QrBindField, RebindCardModal
│  │  ├─ ui/                          # primitives (PageHeader, StatCard, Segmented, SearchInput…), Modal, Toast, Badge, ConfirmDialog
│  │  └─ QrScanner · ScanResultCard · QuickCheckIn
│  └─ lib/
│     ├─ offline/db.ts · sync.ts · scan.ts    # IndexedDB, Sync Manager, offline-first scan
│     ├─ useBarcodeListener.ts        # global USB/Bluetooth reader detection
│     ├─ xlsx.ts                      # RTL .xlsx builder (exceljs)
│     ├─ student-query.ts · attendance-query.ts   # shared filters for lists & exports
│     └─ attendance.ts · students.ts · cards.ts · whatsapp.ts · dates.ts · phone.ts · validators.ts …
```

## Deploying

See **[DEPLOYMENT.md](DEPLOYMENT.md)** for the step-by-step production checklist.

## Production notes

- Set `ADMIN_PASSWORD` before going live. For per-staff accounts, replace `middleware.ts` with Auth.js.
- Schema changes: `npm run db:migrate -- --name <change>` locally, commit `prisma/migrations/`, deploy (migrations run automatically on Vercel).
- iOS Safari has no Background Sync. There, queued scans upload the next time the app is open and online.
- Bump `VERSION` in `public/sw.js` when you change caching rules. Old caches are deleted on activation.
