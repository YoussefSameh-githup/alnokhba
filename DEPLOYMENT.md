# Deployment checklist: Vercel + managed PostgreSQL

Target setup: **Vercel** (Next.js hosting, free HTTPS) and **Neon** or **Supabase** (managed PostgreSQL).
Plan for about 20 minutes the first time.

---

## 1. Push the code to GitHub

```bash
git init
git add .
git commit -m "Al Nokhba attendance system"
git branch -M main
git remote add origin https://github.com/<you>/nokhba-attendance.git
git push -u origin main
```

`.gitignore` already excludes `node_modules`, `.next` and `.env`. **Never commit `.env`.**

## 2. Create the database

**Neon** (recommended, serverless-friendly):
1. Create a project and pick the region closest to Egypt (e.g. `eu-central-1` Frankfurt).
2. Under *Connection details*, copy two strings:
   - **Pooled** (host contains `-pooler`) → `DATABASE_URL`
   - **Direct** (no `-pooler`) → `DIRECT_URL`
3. Make sure both end with `?sslmode=require`.

**Supabase**, alternatively, under *Project Settings → Database → Connection string*:
- `DATABASE_URL` = Transaction pooler (port **6543**) and append `?pgbouncer=true&connection_limit=1`
- `DIRECT_URL` = Direct connection / Session pooler (port **5432**)

> Why two URLs: serverless functions open many short connections, so they need the pooler. Migrations need a direct
> connection.

## 3. Create the Vercel project

1. Go to vercel.com → *Add New → Project* and import the GitHub repo. The framework is detected as Next.js.
2. **Build Command:** set it to `npm run vercel-build`. This runs `prisma migrate deploy` on every deploy, so the
   schema is always up to date.
3. **Region** (*Settings → Functions*): choose the same region as the database (e.g. `fra1`).
4. **Environment Variables** (Production + Preview):

| Name | Value |
|---|---|
| `DATABASE_URL` | pooled URL from step 2 |
| `DIRECT_URL` | direct URL from step 2 |
| `ADMIN_PASSWORD` | a long random password (e.g. `openssl rand -base64 24`) |
| `APP_TIMEZONE` | `Africa/Cairo` |

5. Click **Deploy**.

## 4. First-run setup (once)

Load initial data from your machine with the **production** URLs. Skip the demo seed for a real launch: create the
groups in the app instead.

```bash
# Optional: demo data (3 students, cards NOH-1001..1006). Don't run this against a real launch DB.
DATABASE_URL="<pooled>" DIRECT_URL="<direct>" npm run db:seed
```

Then, in the app:
1. Open `https://<your-app>.vercel.app` and sign in with username **`admin`** and your `ADMIN_PASSWORD`.
2. **الإعدادات → المجموعات والمواد**: create every grade/subject group with its fee and sessions per month.
3. **الإعدادات → بوابة واتساب**: pick a provider and enter its credentials. Turn on auto-send if you want it.
4. **الطلاب → تسجيل طالب**: register students, with one row and one card per subject.

## 5. Set up each scanning device (tablet or phone at the entrance)

1. Open the app URL in **Chrome** (Android) or **Safari** (iPhone/iPad) and sign in.
2. Allow **camera** access when prompted.
3. Install it: on Chrome use *⋮ → Add to Home screen / Install app*. On Safari use *Share → Add to Home Screen*.
4. Open **الماسح** once **while online** and wait for the pill to show `● متصل`. This downloads the offline data
   and caches the app.
5. Test it: turn on airplane mode, scan a card (it should show green or red with "محفوظ محلياً"), turn airplane
   mode off, and watch the queue count drop to 0.

> After registering new students, open the scanner online once (or tap the status pill) so every device's offline
> data includes them. Devices also refresh this automatically every 5 minutes while online.

## 6. Go-live checklist

- [ ] `ADMIN_PASSWORD` is set. Without it the app is **public**.
- [ ] `DATABASE_URL` is the pooled URL, `DIRECT_URL` is the direct one, and both use SSL.
- [ ] The Vercel Build Command is `npm run vercel-build`, and the deploy log shows `All migrations have been successfully applied` or `No pending migrations`.
- [ ] The Vercel function region matches the database region.
- [ ] You've sent a WhatsApp test from a real scan to your own number.
- [ ] Every entrance device has done the airplane-mode test in step 5.
- [ ] Database backups are on: Neon/Supabase do point-in-time restore on paid plans. On the free tier, schedule `pg_dump` yourself.
- [ ] *(Optional)* You've added a custom domain in Vercel → *Settings → Domains*. Use HTTPS only; the camera and offline mode require it.

## 7. Day-2 operations

| Task | How |
|---|---|
| Change the schema | Edit `prisma/schema.prisma`, run `npm run db:migrate -- --name <change>`, commit `prisma/migrations/`, push. Vercel applies it on deploy. |
| Deploy an update | `git push`. Devices pick up the new version on their next online page load. |
| Change offline caching rules | Bump `VERSION` in `public/sw.js` so old caches are dropped. |
| Export attendance | **التقارير → تصدير Excel (CSV)** |
| A card is lost | **الطلاب** → the ↻ icon on that subject's chip → scan the new card. The old card is revoked immediately, including offline. |
| Check health | `GET /api/health` returns `{"ok":true}` when the app and the database are reachable |

## Hosting somewhere other than Vercel (VPS / Railway / Render)

```bash
npm ci
npm run db:deploy        # prisma migrate deploy
npm run build
npm start                # serves on :3000. Put it behind HTTPS (Caddy/Nginx + Let's Encrypt).
```

On a long-running server you can use the same URL for `DATABASE_URL` and `DIRECT_URL`.
