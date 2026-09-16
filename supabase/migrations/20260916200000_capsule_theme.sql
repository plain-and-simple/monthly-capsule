-- Owner-picked Capsule theme for the next compile.
-- Archived capsules keep the HTML/theme they were built with; this column is
-- not backfilled onto past months.

alter table public.groups
  add column capsule_theme text not null default 'classic';

alter table public.groups
  add constraint groups_capsule_theme_check
  check (capsule_theme in ('classic', 'warm', 'minimal', 'heritage'));

comment on column public.groups.capsule_theme is
  'First-party keepsake template (classic, warm, minimal, heritage) applied at the next compile. Past archives stay as-built.';
