-- Allow the owner-only Magazine keepsake theme on the existing capsule_theme
-- column. No new columns or submit fields.

begin;

alter table public.groups
  drop constraint groups_capsule_theme_check;

alter table public.groups
  add constraint groups_capsule_theme_check
    check (capsule_theme in ('classic', 'warm', 'minimal', 'heritage', 'magazine'));

comment on column public.groups.capsule_theme is
  'First-party keepsake template (classic, warm, minimal, heritage, magazine) applied at the next compile. Past archives stay as-built.';

commit;
