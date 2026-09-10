# Handoff — designer UI + submit model A

Shipped on branch `cursor/capsule-ui-submit-model-a-2a49` · PR #10 into `main`.

## What changed

The live app now follows `design/capsule-drafts/` (paper, deep green, serif letters, one primary action). Invented draft content is not copied; real group names, dates, and counts are wired through.

**Submit model A (required)**

| Action | Stored | In compiled capsule / email |
| --- | --- | --- |
| Save as draft | yes | no |
| Save and submit | yes | yes |

After submit the letter stays editable until the window closes. Existing rows default to `submitted`.

## Product locks kept

- Brand: Plain and Simple Monthly Capsule
- Promise: Friends write once a month. You get one capsule.
- Studio create still gated by `CREATE_GROUP_CODE`
- Late writers: **count only** — People does not say who has not written
- Timezone: America/Chicago
- Invite: any member. Settings / regen / force-cycle: owner only
- Empty force-close still compiles
- Header: **Sign out** (not Leave)
- Multi-group: Your groups with Open / Capsule ready / Resting; names never UUIDs; 1 group auto-enters
- Force-cycle labels: Open submit early / Close & make capsule / Send / Not now / Email group

## Apply this migration

`supabase/migrations/20260910010000_submission_status.sql` adds `submissions.status` (`draft` | `submitted`, default `submitted`). Apply it on the Supabase project before dogfooding or compile will not know drafts.

## Dogfood

e2e is not set up. After env + **all** migrations (init, accounts, force-cycle, **submission_status**):

1. **Landing.** `/` is paper: promise, Sign in, Create a capsule group. No photo split. No Forgot password.
2. **Create.** Studio code → account (skip if already signed in) → group name + Submit opens / Submit closes / Email capsule → show-once link + PIN. Copy both. Continue to group home.
3. **Manage.** 0 groups → Nothing here yet + create/join hint. 1 → group home. Many → Your groups with Open / Capsule ready / Resting. Header Sign out.
4. **Join.** Link + PIN + preferred name. Save login optional.
5. **Open group home.** Write your letter. Count only (“Three of six have written”). People / Invite / Settings are text links.
6. **Submit model A.** Save as draft → status “Saved as draft”; group home still invites you to write/continue. Save and submit → “Your letter is in” + Edit until the window closes. Edit again and re-submit.
7. **People.** Preferred names only. No Written / Not yet.
8. **Invite.** Copy link, type PIN, copy message. Server never returns a PIN.
9. **Owner settings.** Cycle days (locked labels), Open submit early / Close & make capsule (confirm), Email Send | Not now, Email group later, Make a new PIN (confirm, show once).
10. **Compile.** Force-close (even with zero letters) still makes a capsule. Draft letters must **not** appear. Submitted letters must. Colophon states a missed **count**, not names.
11. **Email.** Subject `{Group} — {Month}`. Body has letters + Read the whole capsule. Cron still skips `email_held`.

```bash
npm test
npm run typecheck
```

## Key files

- `src/app/globals.css` — designer tokens and layout
- `src/components/app-header.tsx` — brand + Sign out
- `src/lib/submit.ts` + `src/actions/submit.ts` — draft vs submitted
- `src/lib/group-status.ts` — Open / Capsule ready / Resting
- `src/lib/capsule-email.ts` — email HTML
- `supabase/migrations/20260910010000_submission_status.sql`

Designer HTML remains at `design/capsule-drafts/` as the visual reference.
