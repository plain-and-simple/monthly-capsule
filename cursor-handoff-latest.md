# Handoff — Dogfood UI: Your groups, roles, month badge

Shipped on branch `cursor/monthly-capsule-ui-dogfood-fixes-aece`.

## Bugs

1. **Your groups was a no-op with one group.** The backlink and brand mark already pointed at `/manage`, but `GET /manage` with exactly one group redirected through `/api/session/open-solo` back to group home. Most dogfood accounts have one group, so the control did nothing.
2. **Manage list hid owner vs member.** Each row already had `member.role`; the UI never showed it.
3. **Open / Closed sat next to the group name**, outside the month card.

## Fix

| Surface | Before | After |
| --- | --- | --- |
| `GET /manage` with 1 group | redirect to group home | render the list (Create a group stays reachable) |
| Login with 1 group | group home | unchanged (`managePath` still skips the list) |
| Manage row | name + cycle status | name + **Owner** / **Member** badge + cycle status |
| Group home month card | badge beside `<h1>` | badge inside the month tile, next to the month eyebrow |

`/api/session/open-solo` stays for the login shortcut. It is no longer used by the manage page.

## Key files

- `src/lib/session-policy.ts` — `decideManageSolo` always renders
- `src/app/(app)/manage/page.tsx` — no solo redirect; role badge
- `src/app/(app)/g/[uuid]/page.tsx` — Your groups → `/manage`; status inside the card
- `src/lib/group-status.ts` — `membershipRoleLabel`
- `src/lib/copy.ts` — `ROLE_OWNER_LABEL` / `ROLE_MEMBER_LABEL`

## How to verify

1. `npm test` and `npm run typecheck`
2. Signed in, **one** group: group home → **Your groups** (or brand mark) → `/manage` list, not bounced back
3. Same list: each group shows **Owner** or **Member**
4. Group home: Open/Closed is on the month card, not beside the group title
5. Login with one group still lands on group home
