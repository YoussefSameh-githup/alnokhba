# سنتر النخبة التعليمي — Attendance, Billing & Parent Notifications

Next.js 15 (App Router) · TypeScript · Tailwind CSS (RTL, Arabic-first) · Prisma + PostgreSQL · html5-qrcode · Framer Motion · lucide-react · Offline-first PWA (Service Worker + IndexedDB)

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

## Folder structure

```
nokhba-attendance/
├─ prisma/schema.prisma · prisma/seed.ts
├─ public/
│  ├─ sw.js                       # service worker: shell cache + Background Sync
│  └─ icon.svg
├─ src/
│  ├─ middleware.ts               # HTTP Basic admin gate (ADMIN_PASSWORD)
│  ├─ app/
│  │  ├─ scan/page.tsx            # scanner (camera + USB reader), offline-aware result card
│  │  ├─ students/page.tsx        # one row per student, one chip per subject/card
│  │  ├─ reports/page.tsx · settings/page.tsx
│  │  └─ api/
│  │     ├─ scan/                       POST card scan or manual attendance (idempotent by clientId)
│  │     ├─ attendance/sync/            POST bulk offline sync (≤500/batch)
│  │     ├─ offline/snapshot/           GET  data the scanner needs offline
│  │     ├─ health/                     GET  server + DB probe
│  │     ├─ students/ · students/[id]/  GET · POST · PUT (full desired state, atomic) · DELETE
│  │     ├─ enrollments/[id]/card/      POST replace ONE subject's lost card
│  │     ├─ enrollments/[id]/payment/   POST payment status for ONE subject
│  │     ├─ attendance/ · attendance/export/ · stats/ · groups/ · cards/check/ · settings/ · whatsapp/
│  ├─ components/
│  │  ├─ ConnectionStatus.tsx     # 🟢/🔴 pill + SW registration + sync toasts
│  │  ├─ StudentFormModal.tsx     # details + N subject rows (group · card · payment)
│  │  ├─ QrBindField.tsx · RebindCardModal.tsx · ScanResultCard.tsx · ManualAttendanceDialog.tsx · QrScanner.tsx
│  └─ lib/
│     ├─ offline/db.ts            # IndexedDB wrapper (stores: enrollments, queue, meta)
│     ├─ offline/sync.ts          # Sync Manager + useSyncState() hook
│     ├─ offline/scan.ts          # performScan(): online → offline fallback
│     ├─ scan-types.ts            # shapes shared by server & client
│     ├─ attendance.ts            # markAttendance / resolveCard / resolveScannedAt
│     ├─ students.ts              # saveStudent(): one-transaction diff of subjects/cards/payments
│     └─ cards.ts · whatsapp.ts · dates.ts · phone.ts · template.ts · validators.ts
```

## Deploying

See **[DEPLOYMENT.md](DEPLOYMENT.md)** for the step-by-step production checklist.

## Production notes

- Set `ADMIN_PASSWORD` before going live. For per-staff accounts, replace `middleware.ts` with Auth.js.
- Schema changes: `npm run db:migrate -- --name <change>` locally, commit `prisma/migrations/`, deploy (migrations run automatically on Vercel).
- iOS Safari has no Background Sync. There, queued scans upload the next time the app is open and online.
- Bump `VERSION` in `public/sw.js` when you change caching rules. Old caches are deleted on activation.
