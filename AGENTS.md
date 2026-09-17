# Agent notes — Monthly Capsule

Read `README.md` first. That file is the product lock (hosting, PIN, accounts, schedule, compile, email, e2e). This file is how to work on top of it without repeating the mistakes from recent shipping.

Chandler is the product manager. Research, plan, ship. Dogfood. Prefer a usable letter-and-photos capsule over extra features.

## Hard stops

- **PIN is bcrypt-only.** Generated at create/regen, shown once, never recovered. Do not display, email, or reconstruct a stored Group PIN. Do not add PIN-reminder UI. Owner regen is the only way to get a new PIN (old one dies; sessions stay valid).
- **Do not generate a PDF during email send.** Resend has a short timeout. Compile (or first download) stores `capsules.pdf_storage_path`. Email attaches that object only if it already exists. PDF failure must not block compile or email.
- **Do not silently drop photos.** Max is 6 (`MAX_PHOTOS`). If someone picks 10, keep 6, skip compressing the rest, and show `PHOTOS_MAX` (`You can add 6 photos. Extra photos were not added.`).
- **Newspaper wrap is every theme**, not Warm-only. Classic, Warm, Minimal, and Heritage all put photos beside the writing. Theme owns type, paper, and leftover chrome — not “letter then a photo dump.”
- **Do not reopen** hosting/`basePath`, phone/SMS, rich editor, video, co-owners, or regenerate-past-month.
- Theme picker stays **swatch + name**. No layout descriptions on the picker. Default remains Classic. Past months stay as-built.

## Capsule layout (on-screen and PDF)

People typically write about two paragraphs and put photos on the sides so it reads like a newspaper.

- Pair at most one photo with each paragraph (alternate right, then left).
- If they write little and attach a lot, extras go **after** the letter.
- Leftover treatment by theme: Classic/Warm **grid**, Minimal **strip**, Heritage **plates**.
- In-flow HTML must wrap each photo+paragraph in `.letter__run` (`display: flow-root`). Sibling floats after a full-width first paragraph do not wrap.
- CSS: `.letter__photo--weave` floats (~42% width); `--left` / `--right`; stack full-width under 640px.
- PDF: `insetImage` (~42% width, keep `y` at the photo top) then column-aware `wrapped()` until past the photo. `finishWrap()` before the next photo, gallery, plate, or rule.
- Code: `src/lib/capsule-theme.ts` (`weaveLetterBlocks`, `leftoverPhotoBlocks`, `groupWovenRuns`), `src/components/capsule-document.tsx`, `src/lib/capsule-archive.ts`, `src/lib/capsule-pdf.ts`, weave rules in `src/app/globals.css`.

## PDF keepsake

- Built with pdf-lib. Theme palettes follow the catalog paper/ink/accent.
- WebP (and anything else) is re-encoded to JPEG with `sharp` before embed (`preparePdfJpeg`). Camera originals are never stored.
- Session-gated download: `/g/[uuid]/capsule/[YYYY-MM]/pdf` (and `/vN/pdf` for later editions).
- Missing PDFs generate on first download. Email never calls generate-during-send.

## Submit photos

- Client compresses (1600px long edge, WebP or JPEG, ~0.8, 1 MB). Server `sharp` re-encodes and strips EXIF.
- Slice with `photoBatchFit` **before** `compressPhotoFile`.
- Hint: `{n} of 6 photos.` At 6: hide Add, append “Remove one to add another.”
- Overflow uses `role="alert"` and `PHOTOS_MAX` from `src/lib/copy.ts`.
- Server rejects `keep_path` + new files over 6 with the same copy.
- Code: `src/components/submit-form.tsx`, `src/lib/photo-files.ts`, `src/actions/submit.ts`.

## Copy and UI

- Product strings live in `src/lib/copy.ts`. Reuse them; lock them in `src/lib/copy.test.ts`.
- Voice is short and literal. No “Max 6 photos.” toast-speak when `PHOTOS_MAX` exists.
- Cover lists contributors. Capsule missing state is “not ready yet,” not a dead end.

## Tests

- `npm test` and `npm run typecheck` for logic and wiring locks.
- Layout and picker changes need a visual check (wrap beside both paragraphs; leftover extras at the end; photo cap message). Kind-order tests alone missed the first-paragraph float bug.
- Playwright: `e2e/`. Do not hit production unless `E2E_ALLOW_PRODUCTION=1`. PR CI is local smoke only.

## Cursor Cloud

- Web: `npm run dev` on port 3000. `.cursor/start.sh` may start local Supabase first.
- Keep PRs focused. PIN, PDF/layout, and photo-cap are separate concerns.
- Dogfood against the real submit → compile → capsule → PDF path. Do not invent a second editor or a second photo pipeline.
