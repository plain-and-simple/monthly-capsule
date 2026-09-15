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

- **Brand chrome** is the PS lockup (letters + letter-tile + step bar — the mark already includes `PS`). Favicon / apple-touch are the letter-tile icon only. Page title (and the landing footer) still use **Plain and Simple Monthly Capsule**. Resend has no send-API sender avatar (skip). From display stays **Capsule**.
- **Account** is one field `preferred_name`, plus email and a hashed password (min 8). Memberships link an account to groups. **No phone. No SMS.**
- **Manage** is email + password, rate-limited (5 / 15 minutes / IP + email). After login: 0 groups → empty + join hint; 1 → group home; many → pick list. **Forgot password?** emails a one-hour, single-use link via Resend. Same response whether the email has an account. The reset page sets a new password and signs in the same way Manage does.
- Web join with a group UUID + PIN. PIN is generated at create, shown **once**, stored as a bcrypt hash only, never recovered.
- Join asks for preferred name **after** a saved account (email + password). UUID + PIN still identify the group. **No PIN-only seat that can submit.**
- Fresh site: **Create an account** (or Sign in), then **Join existing Capsule** (group ID + PIN). Manage empty state leads with Join existing Capsule.
- Invite `/join/[uuid]`: a landing for that group. Signed in → Group PIN + preferred name. Not signed in → create account / sign in, then **return to the same invite landing** (`next=/join/{uuid}`).
- Save login on group home / submit is only for leftover seats with no `account_id` (e.g. joined before this lock). It is required before draft or submit.
- Owner may **Regenerate PIN**. Confirm first. New PIN is shown once. The old PIN dies immediately. Existing sessions stay valid.
- Invite is the join URL plus an optional PIN the member types, plus share text. The server never returns a PIN after create/regen. Any member.
- People is any member. **preferred_name only** — no emails, no PIN hash.
- Settings (schedule, **Capsule cycle** force open/close/email, regen PIN) is owner only. Members never see force actions.
- Creating a group requires a studio code from `CREATE_GROUP_CODE` (default `plainandsimple` if unset). Compared trim + case-insensitive. Server rejects a missing or wrong code. Then preferred name + email + password. The account owns the group.
- Photos: max 6 per submission. Client compresses before upload (1600px long edge, WebP if the browser can encode it else JPEG, quality ~0.8, hard cap 1 MB; retry lower quality or reject). Server re-encodes with `sharp` at the same caps, strips EXIF, and stores only that object — never the camera original. Re-encode failure is a friendly error, not keep-original.
- Timezone is **America/Chicago** for every group. No picker.
- Schedule fields: `submit_start_day` (default 1), `submit_end_day` (default 8), `email_day` (default 9).
  - Rule: `1 ≤ start ≤ end ≤ 28` **and** `end < email_day ≤ 28`.
- One submission per member per month. In-window save upserts. **Save as draft** is stored but hidden from the compiled capsule. **Save and submit** includes it. After submit the letter stays editable until the window closes. Server rejects when the window is closed. Server also rejects draft and submit when the acting member has no `account_id`.
- Compile job runs after `submit_end_day` ends (Chicago). Idempotent `capsules` row plus a durable `archive` snapshot (letters, names, photo storage paths, HTML). The view page serves that archive so later edits do not rewrite history.
- Email job runs on `email_day`. Sends every compiled edition at or before that Chicago month if `email_sent_at` is null and `email_held` is false (all versions, not only the latest). Recipients are `members.email` or, when that is null, the linked `accounts.email`. Addresses are deduped. Resend skips seats with no address; the owner send result lists **count + names** (no silent skip). `email_sent_at` is set only after Resend accepts every attempted send. Subject is **Your monthly capsule is ready**. From display is **Capsule**. Owner Send is success only when the send is stamped; otherwise the owner sees the error (no silent drop). Cron `?dry=1` previews recipients without calling Resend.
- Owner settings labels are exactly: **Submit opens**, **Submit closes**, **Email capsule**.
- Owner **Capsule cycle** (force, unused = calendar path unchanged):
  - **Open submit early** opens **this Chicago calendar month** (or the next version of it). Already open → “Already open.” A compiled month does **not** walk to next calendar month — force-open again creates **v2 / v3** of the same month.
  - Submissions do **not** roll over: each edition has its own `months` row and empty submission set. Closing v1 freezes those letters; v2 starts empty.
  - **Close & make capsule** (confirm; danger) compiles that edition via `compileGroupMonth` (idempotent per `month_id`). Email is a separate optional step and targets that version’s URL.
  - After compile: **Email the group?** → **Send** (Resend; show sent N / skipped no-email / Resend error; mark sent only on accept; unstamped send is an error) or **Not now** (`email_held`; cron `email_day` will not send until the owner Sends later).
  - **Email group** later from View or Settings when a capsule exists and is unsent. Already emailed → visible error, then owner **Send again** (resends with the locked subject/From). Send always finishes with success or error — never a stuck Sending… spinner.
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
npm run test:e2e
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Apply the SQL in `supabase/migrations/` to your Supabase project (SQL editor, or `supabase db push` if you use the CLI). The first migration creates tables, indexes, RLS, and the private storage bucket. The accounts migration adds `accounts`, `login_attempts`, `members.account_id`, and renames `display_name` → `preferred_name`. The force-cycle migration adds `groups.force_open_year_month` and `capsules.email_held`. The submission_status migration adds `submissions.status`. The capsule_archive migration adds `capsules.archive`. The month_versions migration adds `months.version` and unique `(group_id, year_month, version)`. The password_reset migration adds `password_reset_tokens` and `password_reset_attempts`.

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
| `RESEND_FROM_EMAIL` | Verified Resend sender. Default if unset: `Capsule <capsules@plainandsimple.app>`. Display name is always **Capsule**; domain must be verified in Resend or every send fails. |
| `COOKIE_SECRET` | ≥16 random chars; signs the session JWT |
| `APP_URL` | Origin, no trailing slash. Local: `http://localhost:3000`. Prod: `https://capsule.plainandsimple.app` |
| `CRON_SECRET` | Vercel Cron `Authorization: Bearer …` |
| `CREATE_GROUP_CODE` | Studio code to create a group. Trim + case-insensitive. Default if unset: `plainandsimple`. Set on Vercel for production. |
| `E2E_BASE_URL` | Playwright origin. Leave empty for `http://127.0.0.1:3000`. Never defaults to production. |
| `E2E_EMAIL` / `E2E_PASSWORD` | Optional test account. Auth/submit/group tests skip when unset. |
| `E2E_GROUP_PIN` / `E2E_GROUP_ID` | Optional join-path secrets. Join submit skips when unset. |
| `E2E_CRON_SECRET` | Optional. `GET /api/cron/email?dry=1` (no Resend send). Skip when unset. |
| `E2E_ALLOW_PRODUCTION` | Must be `1` to run e2e against `https://capsule.plainandsimple.app`. Any other value fails closed. |

## Screens

1. **Home** `/` — **Create an account** (preferred name + email + password) or **Sign in**. Then **Create a capsule group** (studio code). No three equal CTAs. No phone. Invite links are a separate path.
2. **Manage** `/manage` — account groups. Empty: **Join existing Capsule** plus create. With groups: pick list (including one group) with owner/member, plus Join existing Capsule. After login with exactly one group and no `next`, go to group home. Your groups always returns to this list.
2a. **Forgot password** `/forgot` — email only. Always the same “if we have that account, we sent a link” copy. Rate-limited 5 / 15 minutes / IP + email.
2b. **Reset password** `/reset/[token]` — set a new password (min 8). Invalid, used, or expired links ask you to request a new one. Success signs in like Manage.
3. **Create** `/create` — studio code → preferred name + email + password + optional group name → UUID + PIN shown once (copy). Account owns the group.
4. **Join** `/join` — signed in: group ID + PIN + preferred name. Not signed in: create account / sign in, then return here.
5. **Join link** `/join/[uuid]` — invite landing. Signed in: PIN + preferred name. Not signed in: create account / sign in, then return to this landing.
6. **Group home** `/g/[uuid]` — name, open/closed, member count, Write your letter / Read the capsule, Earlier capsules, People, Invite, Settings (owner). Save login if this leftover seat has no account.
7. **People** `/g/[uuid]/people` — preferred names. Any member. No emails.
8. **Invite** `/g/[uuid]/invite` — copy join URL, optional typed PIN, and share text (URL + PIN if typed). Server never returns a PIN.
9. **Submit** `/g/[uuid]/submit` — letter + ≤6 photos; Save as draft (hidden from capsule) or Save and submit (included); still editable until the window closes; “Closed.” when shut. No account → Save login first.
10. **Capsule** `/g/[uuid]/capsule/[YYYY-MM]` — first edition (v1). Later same-month compiles: `/g/[uuid]/capsule/[YYYY-MM]/v2`. Read-only archive; session required. Any member.
11. **Owner settings** `/g/[uuid]/settings` — the three day-of-month fields, Capsule cycle (open early / close & make / email), and Regenerate PIN.

## End-to-end tests (Playwright)

Browser tests live in `e2e/`. Grok is out of scope — this is repo/CI only.

**Safe by default.** `E2E_BASE_URL` unset starts a local Next server. Pointing at `capsule.plainandsimple.app` throws unless `E2E_ALLOW_PRODUCTION=1`.

### CI triggers

| Workflow | Trigger | What runs |
| --- | --- | --- |
| `CI` | `pull_request` and `push` to `main` | Unit + typecheck. E2E **local smoke only** (`next start`). Does **not** receive `E2E_BASE_URL` / auth / `E2E_ALLOW_PRODUCTION` secrets. |
| `E2E production` | GitHub `deployment_status` when Vercel marks **Production** `success` | Authenticated Playwright against the production origin from repo secrets. |

Push to `main` is not used for production e2e — that job can finish before Vercel Production is Ready. `deployment_status` is the trigger because this repo already has Vercel GitHub Deployments named `Production` / `Preview`. The production workflow must be on `main` before it will fire. Preview deployments are ignored.

### GitHub Actions secrets (repository scope)

Used only by `.github/workflows/e2e-production.yml`. Do not map them into the PR/main smoke job.

| Secret | Purpose |
| --- | --- |
| `E2E_BASE_URL` | Production origin (`https://capsule.plainandsimple.app`). |
| `E2E_EMAIL` | Test account email |
| `E2E_PASSWORD` | Test account password |
| `E2E_GROUP_PIN` | Group PIN for the join path |
| `E2E_GROUP_ID` | Group UUID for the join path |
| `E2E_CRON_SECRET` | Same value as app `CRON_SECRET` on production. Enables `?dry=1` email preview (no Resend charge). Optional; cron dry-run skips when unset. |
| `E2E_ALLOW_PRODUCTION` | Must be the literal `1` to hit production. |

Do not put the studio / create-group code in e2e. `/admin` only asserts that a **wrong** code is rejected.

### Local

```bash
npx playwright install chromium
npm run test:e2e
```

That starts `next dev` at `http://127.0.0.1:3000` unless `E2E_BASE_URL` is set. Smoke covers landing, sign-in UI, join gate, create studio gate, `/admin` bad-code reject, and unauthorized cron email/compile (401). Cron `?dry=1` is how this repo previews recipients without calling Resend; `RESEND_API_KEY` unset also skips send.

Authenticated Ready (sign in → Your groups → open group → draft if the window is open):

```bash
export E2E_EMAIL=
export E2E_PASSWORD=
export E2E_GROUP_PIN=
export E2E_BASE_URL=http://127.0.0.1:3000   # or a Vercel preview
npm run test:e2e
```

Fill the exports in your shell. Never commit real credentials. HTML report: `npx playwright show-report`.

## Dogfood path

After env + **all** migrations (init, accounts, force-cycle, submission_status, capsule_archive, **month_versions**). Prefer `npm run test:e2e` for the smoke; the steps below are still the manual Ready path:

1. **Create (GWT B).** Open `/`. Upper-right Create Capsule Group. Studio code (local default `plainandsimple` if `CREATE_GROUP_CODE` is unset). Preferred name, email, password (8+). Copy the join link and PIN. Continue to the group home. You are the owner.
2. **Manage (GWT A).** Private window. `/` → **Sign in** with that email + password (or Create an account first). No SMS. One group → group home. Your groups (and the brand mark) open `/manage` even with one group, so you can create another. Sign out from `/manage`. **Forgot password?** from the login card → `/forgot` → same ack whether the email exists. Open the emailed `/reset/…` link, set a new password (8+), land signed in.
3. **Join existing (GWT C).** Sign up (or Sign in) first. **Join existing Capsule**: group ID + PIN + preferred name. Manage lists the group. There is no skip-save PIN-only seat that can submit.
4. **Invite link (GWT D).** Private window. Open the join link while signed out: invite landing asks to create an account or sign in, then returns to the same `/join/{uuid}` for PIN + preferred name. A leftover seat with no `account_id` must Save login before draft or submit.
5. **People (GWT E).** People shows preferred names only — no emails.
6. **Invite / PIN / schedule.** Invite: copy link, type PIN, copy share text. Settings (owner): the three day fields; invalid combos rejected. Regenerate PIN asks to confirm; new PIN once; old PIN fails; sessions stay valid.
7. If Chicago’s day is inside the window, submit a letter + photos. After the window, Submit shows Closed.
8. **Force cycle (owner).** Settings → Capsule cycle. If this Chicago month is not in an open window: Open submit early → that month (or v2+ if it was already compiled). If already open: “Already open.” Close & make capsule → confirm → Read that edition. Email the group? Send (Resend; sent N / skipped / error) or Not now (in-app only; cron email_day does not send). Email group later from View or Settings until sent. A member must not see these actions. Re-open after compile starts an empty new version of the **same** month.
9. Cron (optional, needs the same env):

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/compile
curl -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/cron/email?dry=1"
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/email
```

Compile is idempotent (unique `capsules.month_id`) and writes `capsules.archive`. Email sets `email_sent_at` only after Resend accepts the send. Cron skips a capsule with `email_held`.

## Jobs

Vercel Cron (`vercel.json`), UTC:

- `GET /api/cron/compile` at `10 6 * * *` — after midnight Chicago (CST=06:00 UTC, CDT=05:00 UTC). Compiles the month whose submit window has ended.
- `GET /api/cron/email` at `0 15 * * *` — 09:00/10:00 Chicago. Emails every due unsent edition (subject **Your monthly capsule is ready**, From **Capsule**). `?dry=1` previews without sending.

Both require `Authorization: Bearer $CRON_SECRET`.

## Deploy (capsule.plainandsimple.app)

1. **New Vercel project** from this repo (not a path on the marketing project). Framework: Next.js.
2. Do **not** set `basePath`, `assetPrefix`, or rewrites under `/capsule`.
3. Add the env vars above. Production `APP_URL=https://capsule.plainandsimple.app`. Set `CREATE_GROUP_CODE` on Vercel (ops).
4. Apply `supabase/migrations` to the production Supabase project. Confirm the `capsule-photos` bucket exists and is private.
5. Attach the domain `capsule.plainandsimple.app` (DNS at the registrar / Vercel). Cookies stay on that host.
6. Confirm Vercel Cron is enabled (Pro) or call the two routes from an external scheduler with `CRON_SECRET`.

## Schema (minimal)

`accounts` (preferred_name, unique email, password_hash), `groups` (`force_open_year_month` nullable), `members` (memberships: `preferred_name`, optional `account_id`, unique `group_id + email` where email is not null, unique `account_id + group_id` where account_id is not null), `months` (`version` default 1, unique `group_id + year_month + version`, at most one `open` row per group), `submissions` (unique `month_id + member_id` — no rollover across editions), `photos`, `capsules` (`month_id` unique, `email_held` default false, `archive` jsonb snapshot including `month_version`), `pin_attempts` (5 / 15 minutes / IP+group), `login_attempts` (5 / 15 minutes / IP+email), `password_reset_tokens` (SHA-256 of the emailed secret, expiry, `used_at`), `password_reset_attempts` (5 / 15 minutes / IP+email).

### Live SQL for CoS (`uqqxauszzorzhmngcnvf`)

Apply `supabase/migrations/20260910120000_month_versions.sql` in the SQL editor (do not skip). Existing month rows become `version = 1`. The October 2026 dogfood capsule stays `/g/…/capsule/2026-10`. After that, force-open in September opens **September**, not another October.
