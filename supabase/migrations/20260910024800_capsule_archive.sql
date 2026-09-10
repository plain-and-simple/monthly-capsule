-- Durable compile snapshot so any member can read a past capsule
-- without depending on live, still-editable submissions.

alter table public.capsules
  add column if not exists archive jsonb;

comment on column public.capsules.archive is
  'Compile-time snapshot: { version, year_month, group_name, html, letters: [{ preferred_name, body, photos: [{ storage_path, width, height, sort_order }] }], member_count, missed_count }. View signs photo URLs at read time.';
