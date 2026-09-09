# Handoff — owner force-cycle (Monthly Capsule)

Shipped 2026-09-09 on branch `cursor/owner-force-cycle-78c3`.

## What shipped

Owner-only **Capsule cycle** on Settings. Cron calendar path is unchanged when force is unused.

| Action | Behavior |
| --- | --- |
| **Open submit early** | Opens the **next closed→open** period (`groups.force_open_year_month`). After this month’s window: next month. Before `submit_start_day`: this month. Already open → “Already open.” No duplicate `months` row. |
| **Close & make capsule** | Confirm (danger). Closes the open period (or cron compile target if already closed). Always runs `compileGroupMonth` (idempotent HTML capsule). |
| **Email the group?** | After compile succeeds, if unsent. **Send** = existing Resend path, sets `email_sent_at`, no double-send. **Not now** = `capsules.email_held`. |
| **Email group** later | Settings and View capsule, when a capsule exists and `email_sent_at` is null. |

Members: no Settings force actions. Server actions return “Owner only.”

**Cron coexistence (F8):** `isSubmitOpen` / compile / email target days are untouched. Email cron also skips `email_held`. If force is never used, open/close/compile/email_day behave as before.

**Submit gate** uses `openSubmitYearMonth` so a force-opened next month receives letters (not “always this calendar month”). A compiled/closed month does not reopen on leftover calendar days.

### Schema (apply this migration)

`supabase/migrations/20260909223000_force_cycle.sql`

- `groups.force_open_year_month` text null (`YYYY-MM`)
- `capsules.email_held` boolean not null default false

### Key files

- `src/lib/cycle.ts` — next period, open window, force-close target, owner decisions
- `src/lib/email-policy.ts` — cron send vs hold vs sent
- `src/actions/cycle.ts` — force open / close / send / skip
- `src/components/cycle-form.tsx` — Settings UI
- `src/components/email-group-form.tsx` — View later-send
- Cron routes still call `compileDueCapsules` / `sendDueCapsuleEmails`

## How to dogfood

1. Apply **all three** migrations to the Supabase project (init, accounts, force-cycle).
2. Owner: Settings → **Capsule cycle**.
3. If the group is **Closed** (Chicago day outside 1–8, or after a force-close): **Open submit early**. Group home should read **Open**. A second member can **Submit**. Opening again → **Already open.**
4. **Close & make capsule** → confirm. Window closes. **View capsule** works (empty letters is fine). Prompt: **Email the group?**
5. **Not now.** Capsule stays in-app. Call `GET /api/cron/email` with `CRON_SECRET` on/after `email_day` — it must **not** send (`skipped: held`).
6. Settings or View → **Email group**. With `RESEND_API_KEY` it sends to members who have email and marks sent. Click again → **Already sent.**
7. Repeat close+compile: idempotent, no second capsule row.
8. Sign in as a member: Settings is hidden; posting the cycle actions returns Owner only.
9. Leave force unused on another group: calendar open/close/compile/email_day unchanged.

No phone/SMS. Preferred name account model unchanged. Landing not rewritten.
