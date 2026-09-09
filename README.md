# Plain and Simple Monthly Capsule

Friends write a letter (and up to six photos) each month. After the window closes, Capsule compiles a private HTML page and emails a link.

## Hosting lock (do not reopen)

- Origin: [https://capsule.plainandsimple.app](https://capsule.plainandsimple.app)
- **Separate Vercel project** from the PlainAndSimple marketing site. Not a monorepo path.
- **No Next.js `basePath`.** No `assetPrefix`. No site-wide `/capsule` prefix.
- **Path + rewrite** on `plainandsimple.app/capsule` was considered and **rejected**.
- Session cookie is **host-only** on `capsule.plainandsimple.app` (`Path=/`, no `Domain` on the parent).
- App routes are rooted at `/` (`/join/…`, `/g/…`). `/g/[uuid]/capsule/[YYYY-MM]` is a month page on this subdomain, not a marketing-site prefix.

## Product locks

- Web join with a group UUID + PIN. PIN is generated at create, shown **once**, stored as a bcrypt hash only, never recovered.
- Creating a group requires a studio code from `CREATE_GROUP_CODE` (default `plainandsimple` if unset). Compared trim + case-insensitive. Server rejects a missing or wrong code.
- Owner email required at create. Member email optional; Resend skips members with no email.
- Photos: max 6 per submission. Client resizes to a 1600px long edge. Server checks MIME + size.
- Timezone is **America/Chicago** for every group. No picker.
- Schedule fields: `submit_start_day` (default 1), `submit_end_day` (default 8), `email_day` (default 9).
  - Rule: `1 ≤ start ≤ end ≤ 28` **and** `end < email_day ≤ 28`.
- One submission per member per month. In-window save upserts. Server rejects when the window is closed.
- Compile job runs after `submit_end_day` ends (Chicago). Idempotent `capsules` row + HTML page.
- Email job runs on `email_day`. Sends only if a capsule exists and `email_sent_at` is null.
- Owner settings labels are exactly: **Submit opens**, **Submit closes**, **Email capsule**.
- Sessions: httpOnly, Secure (prod), SameSite=Lax, host-only cookie on `capsule.plainandsimple.app` binding `member_id` + `group_id`.
- Capsules are session-gated. No public unauthenticated pages.

Out of scope: PDF, Apple Sign In / CloudKit, PIN regen, send-now, co-owners, rich editor, video, per-member schedules.

## Stack

- Next.js App Router + TypeScript on Vercel
- Supabase Postgres + Storage (private bucket `capsule-photos`) + RLS
- Resend for email

App I/O uses the **service role** on the server. RLS is enabled and `anon` / `authenticated` have no table grants. Create/join verify the PIN in server actions. Photos are served with short-lived signed URLs.

## Local run

```bash
cp .env.example .env.local
# fill in values
npm install
npm test
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Apply the SQL in `supabase/migrations/` to your Supabase project (SQL editor, or `supabase db push` if you use the CLI). The first migration creates tables, indexes, RLS, and the private storage bucket.

```bash
npm run typecheck
npm run build
```

## Env

See `.env.example`.

| Variable | Notes |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable / anon key (not used for table I/O) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only. Never expose to the browser. |
| `RESEND_API_KEY` | Skip email send if unset; marker stays null |
| `RESEND_FROM_EMAIL` | Verified sender, e.g. `Capsule <capsule@plainandsimple.app>` |
| `COOKIE_SECRET` | ≥16 random chars; signs the session JWT |
| `APP_URL` | Origin, no trailing slash. Local: `http://localhost:3000`. Prod: `https://capsule.plainandsimple.app` |
| `CRON_SECRET` | Vercel Cron `Authorization: Bearer …` |
| `CREATE_GROUP_CODE` | Studio code to create a group. Trim + case-insensitive. Default if unset: `plainandsimple`. Set on Vercel for production. |

## Screens

1. **Home** `/` — Create a group, Join a group, and Open your capsule when a session exists.
2. **Create** `/create` — studio code + optional group name + owner email → UUID + PIN shown once (copy).
3. **Join** `/join` — join link or group ID + PIN + display name + optional email → session.
4. **Join link** `/join/[uuid]` — PIN + display name + optional email → session.
5. **Group home** `/g/[uuid]` — name, open/closed, member count, Submit / View capsule.
6. **Submit** `/g/[uuid]/submit` — letter + ≤6 photos; upsert in window; “Closed.” when shut.
7. **Capsule** `/g/[uuid]/capsule/[YYYY-MM]` — read-only HTML; session required.
8. **Owner settings** `/g/[uuid]/settings` — the three day-of-month fields.

## Manual check: create then join a second session

e2e is not set up. After env + migration:

1. Browser A: from home, Create a group. Enter the studio code (local default `plainandsimple` if `CREATE_GROUP_CODE` is unset). Copy the join link and PIN. Continue to the group home (owner session). Home then shows Open your capsule.
2. Browser B (or a private window): Join a group from home — paste the join link or the group ID, plus PIN, a display name, optional email. Or open `/join/[uuid]`. You land on the same group home as a member.
3. Owner: Settings — change the three day fields; invalid combos (e.g. close ≥ email day) are rejected.
4. If Chicago’s day is inside the window, submit a letter + photos from either session. Saving again replaces that member’s letter. After the window, Submit shows Closed and the server rejects writes.
5. Cron (optional, needs the same env):

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/compile
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/email
```

Compile is idempotent (unique `capsules.month_id`). Email sets `email_sent_at` only after a Resend key is present.

## Jobs

Vercel Cron (`vercel.json`), UTC:

- `GET /api/cron/compile` at `10 6 * * *` — after midnight Chicago (CST=06:00 UTC, CDT=05:00 UTC). Compiles the month whose submit window has ended.
- `GET /api/cron/email` at `0 15 * * *` — 09:00/10:00 Chicago. Emails members who have an address.

Both require `Authorization: Bearer $CRON_SECRET`.

## Deploy (capsule.plainandsimple.app)

1. **New Vercel project** from this repo (not a path on the marketing project). Framework: Next.js.
2. Do **not** set `basePath`, `assetPrefix`, or rewrites under `/capsule`.
3. Add the env vars above. Production `APP_URL=https://capsule.plainandsimple.app`. Set `CREATE_GROUP_CODE` on Vercel (ops).
4. Apply `supabase/migrations` to the production Supabase project. Confirm the `capsule-photos` bucket exists and is private.
5. Attach the domain `capsule.plainandsimple.app` (DNS at the registrar / Vercel). Cookies stay on that host.
6. Confirm Vercel Cron is enabled (Pro) or call the two routes from an external scheduler with `CRON_SECRET`.

## Schema (minimal)

`groups`, `members` (unique `group_id + email` where email is not null), `months`, `submissions` (unique `month_id + member_id`), `photos`, `capsules` (`month_id` unique), plus `pin_attempts` for PIN rate limits (5 / 15 minutes / IP+group).
