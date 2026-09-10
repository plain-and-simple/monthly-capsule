# Handoff — Same-month capsule versions

Shipped on branch `cursor/same-month-capsule-versions-1caa`.

## Product

Force-open used to walk calendar months (Sep → Oct → Nov) on each dogfood open/close. Chandler wants **this Chicago month**, and if that month is already compiled, a **new edition** (v2, v3) of the same month — not the next calendar month.

Calendar day numbers still drive cron. Force open/close stay owner-only overrides.

## Behavior

| Situation (America/Chicago) | Force-open |
| --- | --- |
| This month not open / still needs writing | Open **this** month (v1 if none) |
| This month already compiled | Open **v2 / v3** of this month (empty submissions) |
| Submit already open | “Already open.” |
| Hard cap (24 editions) | “This month cannot take another version.” |

Force-open stays active through the **rest of that Chicago calendar month**, including days after `submit_end_day` (mid-month writing after the window).

Closing v1 freezes those letters on that `month_id`. Opening v2 creates a new `months` row. Submissions are unique on `(month_id, member_id)` — nothing is copied.

## Schema

`months.version integer not null default 1`

- Unique: `(group_id, year_month, version)` (replaces `(group_id, year_month)`)
- Partial unique: one `open` row per group
- Existing rows (including live October 2026) become v1
- Capsule archive JSON gains `month_version` (schema `version` stays 1)

### Live SQL for CoS (`uqqxauszzorzhmngcnvf`)

Apply `supabase/migrations/20260910120000_month_versions.sql` in the SQL editor **before** relying on force-open in production. Do not skip. This agent did not apply it.

After apply: `/g/…/capsule/2026-10` still works (v1). Force-open in September opens **September**, not another October.

## URLs / UI

- v1: `/g/{id}/capsule/2026-09`
- v2+: `/g/{id}/capsule/2026-09/v2`
- Group home primary CTA = latest compiled (`year_month desc, version desc`)
- Earlier capsules lists the rest, labeled `September 2026 · v2` when version > 1
- Email link + subject target the edition being sent

## Key files

- `src/lib/month-version.ts` — `planForceOpen`, paths, labels
- `src/lib/cycle.ts` — `forceOpenYearMonth`, force-open lasts the calendar month
- `src/lib/compile.ts` — version-aware `ensureMonth` / compile / find
- `src/actions/cycle.ts` — force-open uses current month + plan
- `src/lib/email.ts` — send/hold by edition
- `src/app/(app)/g/[uuid]/capsule/view.tsx` + `[yearMonth]/[edition]/page.tsx`
- `src/app/(app)/g/[uuid]/page.tsx` — earlier capsules + versioned hrefs

## How to verify

1. `npm test` and `npm run typecheck`
2. Apply the month_versions migration on the target DB
3. After the window (e.g. Sept 10): Settings → Open submit early → **September** opens
4. Submit a letter. Close & make capsule. View `/capsule/2026-09`
5. Open submit early again → September **v2**, submit page empty (no v1 letter)
6. Close v2 → `/capsule/2026-09/v2` distinct from v1; earlier capsules lists both
7. Email group from the v2 view — mail goes to that URL
8. Cron compile/email still key off calendar days; they compile/send the open or latest edition of the target month

No live migration was applied from this agent.
