# P0 Capsule UI redesign — handoff

**Repo:** https://github.com/plain-and-simple/monthly-capsule (`main`)  
**Live host:** https://capsule.plainandsimple.app — no `basePath`  
**Force-cycle:** out of scope this WO. Do not add it on landing or group home.

## Work order (product locks)

1. Landing promise: **Friends write once a month. You get one capsule.**
2. Create success: **show-once PIN + copy only** (no PIN email)
3. Manage 1 group: **auto-enter** + **group name in header**
4. Brand: **Plain and Simple Monthly Capsule** in header/title — kill bare “Capsule” chrome

Do not second-guess product. No schema break unless required for display names.

## KEEP / CUT / SHIP — what shipped

### LANDING `/`

| | |
| --- | --- |
| KEEP | Photo left, beige Manage right, Create secondary upper-right, email/password, Join via share only. |
| CUT | Bare “Capsule” chrome. Underlined Create-as-link. “No phone.” Sparse default type. |
| SHIP | Header = **Plain and Simple Monthly Capsule**. Promise line. Create = quiet secondary **button**. Right: **Manage your capsule** + fine **Sign in** · Email · Password · Continue. Tighter type/weight/rhythm. |

### CREATE + SUCCESS

| | |
| --- | --- |
| KEEP | Studio code then setup. Show-once PIN + copy only. `CREATE_GROUP_CODE` unchanged. |
| CUT | Quiet toast for success. Join-link card on the success screen. |
| SHIP | **Hero success:** group name · big PIN · Copy · “Show once — save it.” Then Continue into the group. `shareUrl` still returned (Invite uses the join URL); it is not shown here. |

### JOIN

| | |
| --- | --- |
| KEEP | UUID + PIN via share (`/join/[uuid]`). |
| CUT | PIN / password label muddle. |
| SHIP | **Group PIN** (join) vs **Password** (account). Preferred name labels stay. |

### MANAGE 0 / 1 / many

| | |
| --- | --- |
| KEEP | 0 empty / 1 auto-enter / many pick. Login already routed one-group to group home. |
| CUT | UUID rows. Manage-0 dead end (no Create; Join-a-group as the only out). |
| SHIP | 0: **No groups yet** + Create + **Have a link? Open it to join.** 1: skip list (`/manage` redirects into the group; header = group name). Many: names only. |

### GROUP HOME

| | |
| --- | --- |
| KEEP | State CTA (Submit when open, View capsule when closed and a capsule exists). |
| CUT | People / Invite / Settings as equal primaries. Force-cycle on home. |
| SHIP | **One primary:** Submit (open) or View capsule (closed). People · Invite · Settings quiet. Header = group name. |

### PEOPLE / INVITE / SETTINGS

| | |
| --- | --- |
| KEEP | Owner-only Settings. Invite never returns a PIN. Regen confirm. Share text. |
| CUT | Force-cycle on landing/home. |
| SHIP | Force-cycle later as a Settings add-on only — **not in this WO**. Invite helper: “Share the link. Type the PIN if you have it. We never show it again.” Preferred name labels. |

## Constraints held

- `CREATE_GROUP_CODE`, accounts (`preferred_name` / email / password), Invite never returns PIN, regen confirm, share text.
- Few words. Plain and Simple Monthly Capsule brand.
- No schema migration. Unnamed groups display as **Untitled group** (display only).
- Hosting lock: no `basePath`, no `/capsule` prefix.

## Tests

- `src/lib/copy.test.ts` — landing copy smoke + create success hero smoke + join/manage labels.
- Existing manage / account / hosting / studio-code tests unchanged.

## Out of scope

Force-cycle (landing, group home, or Settings). PIN email. Schema changes.
