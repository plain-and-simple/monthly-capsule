-- Same-month capsule editions (v2, v3, …) for owner force re-open/close.
-- Calendar cron still keys off day-of-month. Submissions stay on month_id,
-- so a new edition starts empty (no rollover).

alter table public.months
  add column if not exists version integer not null default 1;

alter table public.months
  drop constraint if exists months_group_year_month_unique;

alter table public.months
  drop constraint if exists months_version_positive;

alter table public.months
  add constraint months_version_positive check (version >= 1);

alter table public.months
  drop constraint if exists months_group_year_month_version_unique;

alter table public.months
  add constraint months_group_year_month_version_unique unique (group_id, year_month, version);

create unique index if not exists months_one_open_per_group
  on public.months (group_id)
  where status = 'open';

comment on column public.months.version is
  'Compile edition within a calendar month. 1 = first / default (no v1 in casual UI); 2+ shown as v2, v3.';
