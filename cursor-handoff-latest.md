# Handoff — email accept + stored capsule archive

Shipped on branch `cursor/fix-capsule-email-archive-70b8`.

## Production facts (verified on `uqqxauszzorzhmngcnvf`)

Group **stepppy**, month `2026-10`, status `compiled`. Capsule row exists. `email_sent_at` is set, `email_held` is false. `capsules` has no HTML — only a marker row. Owner seat is Chacha / `chanfans@gmail.com` (also the only account). Chandler confirmed that address did **not** receive the mail.

Curtis / Chan are on a different group (`steppy`) and are out of scope.

## Root cause

`resend.emails.send()` returns `{ data, error }` and does **not** throw on a normal API failure (unverified domain, bad from, rejected key). `sendCapsuleEmail` ignored that object and always wrote `email_sent_at` whenever `RESEND_API_KEY` was present. The app then hid Email group and told the owner it worked.

Likely live From mismatch:

- Code fallback was `Capsule <capsule@plainandsimple.app>` (singular).
- Designer mail is `capsules@plainandsimple.app` (plural).
- Resend only accepts a **verified** domain. This agent cannot see the Capsule Vercel project (MCP only lists marketing `plainandsimple`), so CoS must confirm `RESEND_API_KEY` + `RESEND_FROM_EMAIL` on that project.

## Fix 1 — honest email send

- Recipients: `members.email`, else linked `accounts.email`. Deduped. Invalid / empty skipped.
- Stamp `email_sent_at` only when Resend returns an id for **every** attempted recipient.
- Owner sees `Sent N. Skipped M with no email.` and/or `Resend error: …`.
- From header is `{Group} via Plain and Simple <verified@mailbox>`. Default mailbox is `capsules@plainandsimple.app`.

## Fix 2 — stored archive

Compile writes `capsules.archive` (jsonb): letters, names, photo `storage_path`s, HTML snapshot without signed URLs. View serves that archive and signs photos at read time. First view of an old marker row backfills the snapshot. Closed home already has **Read the capsule** + **Earlier capsules**.

## Apply on live Supabase `uqqxauszzorzhmngcnvf`

1. `supabase/migrations/20260910024800_capsule_archive.sql` (and `20260910010000_submission_status.sql` if not already applied).
2. Confirm Resend: domain `plainandsimple.app` verified; `RESEND_FROM_EMAIL` is that verified address (recommend `Plain and Simple <capsules@plainandsimple.app>`).
3. Unstick the false success so the owner can Send again:

```sql
update public.capsules
set email_sent_at = null, email_held = false
where id = '5a06b0fa-cc80-4db5-8b5a-fac361adfaf2';
```

Apply the migration **before or with** deploy. After deploy, opening `/g/{stepppy}/capsule/2026-10` backfills `archive` for the October row.

## Verify

```bash
npm test
npm run typecheck
```

Owner Settings → Email group on 2026-10 after the SQL unstick. Expect either a real inbox message or a visible Resend error — never a silent `email_sent_at`.

## Key files

- `src/lib/recipients.ts` — member + account emails, dedupe
- `src/lib/email-policy.ts` — Resend accept, stamp rule, From header, owner copy
- `src/lib/email.ts` — send path
- `src/lib/capsule-archive.ts` + `src/lib/compile.ts` — snapshot
- `src/app/(app)/g/[uuid]/capsule/[yearMonth]/page.tsx` — serve archive
- `supabase/migrations/20260910024800_capsule_archive.sql`
