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

- **Account** is one field `preferred_name`, plus email and a hashed password (min 8). Memberships link an account to groups. **No phone. No SMS.**
- **Manage** is email + password, rate-limited (5 / 15 minutes / IP + email). After login: 0 groups → empty + join hint; 1 → group home; many → pick list.
- Web join with a group UUID + PIN. PIN is generated at create, shown **once**, stored as a bcrypt hash only, never recovered.
- Join asks for preferred name. **Save login** (email + password) is optional. Skip → group session only until it expires; Manage will not list that group until they save.
- Owner may **Regenerate PIN**. Confirm first. New PIN is shown once. The old PIN dies immediately. Existing sessions stay valid.
- Invite is the join URL plus an optional PIN the member types, plus share text. The server never returns a PIN after create/regen. Any member.
- People is any member. **preferred_name only** — no emails, no PIN hash.
- Settings (schedule, **Capsule cycle** force open/close/email, regen PIN) is owner only. Members never see force actions.
- Creating a group requires a studio code from `CREATE_GROUP_CODE` (default `plainandsimple` if unset). Compared trim + case-insensitive. Server rejects a missing or wrong code. Then preferred name + email + password. The account owns the group.
- Photos: max 6 per submission. Client resizes to a 1600px long edge. Server checks MIME + size.
- Timezone is **America/Chicago** for every group. No picker.
- Schedule fields: `submit_start_day` (default 1), `submit_end_day` (default 8), `email_day` (default 9).
  - Rule: `1 ≤ start ≤ end ≤ 28` **and** `end < email_day ≤ 28`.
- One submission per member per month. In-window save upserts. **Save as draft** is stored but hidden from the compiled capsule. **Save and submit** includes it. After submit the letter stays editable until the window closes. Server rejects when the window is closed.
- Compile job runs after `submit_end_day` ends (Chicago). Idempotent `capsules` row plus a durable `archive` snapshot (letters, names, photo storage paths, HTML). The view page serves that archive so later edits do not rewrite history.
- Email job runs on `email_day`. Sends only if a capsule exists, `email_sent_at` is null, and `email_held` is false. Recipients are `members.email` or, when that is null, the linked `accounts.email`. Addresses are deduped. Resend skips seats with no address. `email_sent_at` is set only after Resend accepts every attempted send.
- Owner settings labels are exactly: **Submit opens**, **Submit closes**, **Email capsule**.
- Owner **Capsule cycle** (force, unused = calendar path unchanged):
  - **Open submit early** opens **this Chicago calendar month** (or the next version of it). Already open → “Already open.” A compiled month does **not** walk to next calendar month — force-open again creates **v2 / v3** of the same month.
  - Submissions do **not** roll over: each edition has its own `months` row and empty submission set. Closing v1 freezes those letters; v2 starts empty.
  - **Close & make capsule** (confirm; danger) compiles that edition via `compileGroupMonth` (idempotent per `month_id`). Email is a separate optional step and targets that version’s URL.
  - After compile: **Email the group?** → **Send** (Resend; show sent N / skipped no-email / Resend error; mark sent only on accept) or **Not now** (`email_held`; cron `email_day` will not send until the owner Sends later).
  - **Email group** later from View or Settings when a capsule exists and is unsent.
- Sessions: httpOnly, Secure (prod), SameSite=Lax, host-only cookies on `capsule.plainandsimple.app`. `capsule_session` binds `member_id` + `group_id`. `capsule_account` binds `account_id`.
- Capsules are session-gated. No public unauthenticated pages.

Out of scope: PDF, phone / SMS OTP, first/last name, Apple Sign In / CloudKit, co-owners, rich editor, video, per-member schedules.

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

Apply the SQL in `supabase/migrations/` to your Supabase project (SQL editor, or `supabase db push` if you use the CLI). The first migration creates tables, indexes, RLS, and the private storage bucket. The accounts migration adds `accounts`, `login_attempts`, `members.account_id`, and renames `display_name` → `preferred_name`. The force-cycle migration adds `groups.force_open_year_month` and `capsules.email_held`. The submission_status migration adds `submissions.status`. The capsule_archive migration adds `capsules.archive`. The month_versions migration adds `months.version` and unique `(group_id, year_month, version)`.

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
| `RESEND_API_KEY` | Skip email send if unset; `email_sent_at` stays null |
| `RESEND_FROM_EMAIL` | Verified Resend sender. Default if unset: `Plain and Simple <capsules@plainandsimple.app>`. Domain must be verified in Resend or every send fails. |
| `COOKIE_SECRET` | ≥16 random chars; signs the session JWT |
| `APP_URL` | Origin, no trailing slash. Local: `http://localhost:3000`. Prod: `https://capsule.plainandsimple.app` |
| `CRON_SECRET` | Vercel Cron `Authorization: Bearer …` |
| `CREATE_GROUP_CODE` | Studio code to create a group. Trim + case-insensitive. Default if unset: `plainandsimple`. Set on Vercel for production. |

## Screens

1. **Home** `/` — left picture; right **Manage your capsule** (email → password → Continue). Upper-right **Create Capsule Group**. No three equal CTAs. No phone.
2. **Manage** `/manage` — account groups. Empty + join hint, a pick list, or (after login with exactly one group) the group home.
3. **Create** `/create` — studio code → preferred name + email + password + optional group name → UUID + PIN shown once (copy). Account owns the group.
4. **Join** `/join` — join link or group ID + PIN + preferred name. Optional Save login (email + password). Skip → group session only.
5. **Join link** `/join/[uuid]` — PIN + preferred name + optional Save login.
6. **Group home** `/g/[uuid]` — name, open/closed, member count, Write your letter / Read the capsule, Earlier capsules, People, Invite, Settings (owner). Save login if this seat has no account.
7. **People** `/g/[uuid]/people` — preferred names. Any member. No emails.
8. **Invite** `/g/[uuid]/invite` — copy join URL, optional typed PIN, and share text (URL + PIN if typed). Server never returns a PIN.
9. **Submit** `/g/[uuid]/submit` — letter + ≤6 photos; Save as draft (hidden from capsule) or Save and submit (included); still editable until the window closes; “Closed.” when shut.
10. **Capsule** `/g/[uuid]/capsule/[YYYY-MM]` — first edition (v1). Later same-month compiles: `/g/[uuid]/capsule/[YYYY-MM]/v2`. Read-only archive; session required. Any member.
11. **Owner settings** `/g/[uuid]/settings` — the three day-of-month fields, Capsule cycle (open early / close & make / email), and Regenerate PIN.

## Dogfood path

e2e is not set up. After env + **all** migrations (init, accounts, force-cycle, submission_status, capsule_archive, **month_versions**):

1. **Create (GWT B).** Open `/`. Upper-right Create Capsule Group. Studio code (local default `plainandsimple` if `CREATE_GROUP_CODE` is unset). Preferred name, email, password (8+). Copy the join link and PIN. Continue to the group home. You are the owner.
2. **Manage (GWT A).** Private window. `/` → Manage your capsule with that email + password. No SMS. One group → group home. Sign out from `/manage` (Leave, then Your capsules, or open `/manage` directly).
3. **Join without save (GWT C).** Another private window. Open the join link. Preferred name. Leave Save login unchecked. You land in the group. Manage with a *new* email does not list this group. The owner’s Manage still does.
4. **Join with save (GWT D).** Preferred name + check Save login + email + password. That account’s Manage finds the group. Or Save login from group home after a skip.
5. **People (GWT E).** People shows preferred names only — no emails.
6. **Invite / PIN / schedule.** Invite: copy link, type PIN, copy share text. Settings (owner): the three day fields; invalid combos rejected. Regenerate PIN asks to confirm; new PIN once; old PIN fails; sessions stay valid.
7. If Chicago’s day is inside the window, submit a letter + photos. After the window, Submit shows Closed.
8. **Force cycle (owner).** Settings → Capsule cycle. If this Chicago month is not in an open window: Open submit early → that month (or v2+ if it was already compiled). If already open: “Already open.” Close & make capsule → confirm → Read that edition. Email the group? Send (Resend; sent N / skipped / error) or Not now (in-app only; cron email_day does not send). Email group later from View or Settings until sent. A member must not see these actions. Re-open after compile starts an empty new version of the **same** month.
9. Cron (optional, needs the same env):

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/compile
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/email
```

Compile is idempotent (unique `capsules.month_id`) and writes `capsules.archive`. Email sets `email_sent_at` only after Resend accepts the send. Cron skips a capsule with `email_held`.

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

`accounts` (preferred_name, unique email, password_hash), `groups` (`force_open_year_month` nullable), `members` (memberships: `preferred_name`, optional `account_id`, unique `group_id + email` where email is not null, unique `account_id + group_id` where account_id is not null), `months` (`version` default 1, unique `group_id + year_month + version`, at most one `open` row per group), `submissions` (unique `month_id + member_id` — no rollover across editions), `photos`, `capsules` (`month_id` unique, `email_held` default false, `archive` jsonb snapshot including `month_version`), `pin_attempts` (5 / 15 minutes / IP+group), `login_attempts` (5 / 15 minutes / IP+email).

### Live SQL for CoS (`uqqxauszzorzhmngcnvf`)

Apply `supabase/migrations/20260910120000_month_versions.sql` in the SQL editor (do not skip). Existing month rows become `version = 1`. The October 2026 dogfood capsule stays `/g/…/capsule/2026-10`. After that, force-open in September opens **September**, not another October.
