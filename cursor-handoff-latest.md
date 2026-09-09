# Handoff — GET /manage cookie-write 500

Shipped on branch `cursor/fix-manage-cookie-write-edbd`.

## Production bug

Signed-in `GET /manage` returned 500 (`digest: 1808042703`):

```
Error: Cookies can only be modified in a Server Action or Route Handler.
```

Next.js forbids `cookies().set` during Server Component render. Two render paths wrote cookies:

1. **`/manage` with exactly one group** called `setSession()` then redirected to the group home.
2. **`getAccount()`** called `clearAccountSession()` when the account JWT was present but the account row was gone (also hit from `/` and other pages that read the account).

Catching the error would still leave sessions wrong. Writes moved to Route Handlers.

## Fix

| Render situation | Before (illegal write) | After |
| --- | --- | --- |
| Valid account, 1 group on `GET /manage` | `setSession` in the page | `redirect("/api/session/open-solo")` — Route Handler sets the group cookie, then `redirect(/g/…)` |
| Cookie present, JWT invalid or account missing | `clearAccountSession` in `getAccount` | `redirect("/api/session/clear")` — Route Handler expires the account cookie, then `redirect(/)` |
| Valid account, 0 or many groups | render | unchanged (read-only) |
| No account cookie on `/manage` | `redirect(/)` | unchanged |

`getAccount()` is read-only. Invalid sessions become a signed-out landing page without a 500. The stale cookie is actually expired, not left behind.

Login (`manageLogin`) and the group pick-list (`openManagedGroup`) already set cookies in Server Actions and are unchanged.

## Key files

- `src/lib/session-policy.ts` — when a write is allowed; stale-session and solo-group decisions
- `src/lib/session.ts` — `getAccount` no longer calls `clearAccountSession`
- `src/app/(app)/manage/page.tsx` — no `setSession` during render
- `src/app/api/session/clear/route.ts`
- `src/app/api/session/open-solo/route.ts`
- `src/lib/session-policy.test.ts`

## How to verify

1. `npm test` — includes cookie-write policy + RSC source regression.
2. Anonymous `GET /` → 200 landing.
3. Anonymous `GET /manage` → redirect `/` (not 500).
4. `GET /api/session/clear` → expires `capsule_account`, redirect `/`.
5. Signed-in, **one** group: `/manage` → `/api/session/open-solo` → group home with `capsule_session` set.
6. Signed-in, **many** groups: `/manage` renders the pick list (no cookie write).
7. Garbage or orphaned `capsule_account` on `/` or `/manage` → `/api/session/clear` → landing, signed out, no 500.

No schema change. Force-cycle from PR #8 is untouched.
