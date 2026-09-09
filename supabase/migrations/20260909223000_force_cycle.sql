-- Owner force-cycle: open the next closed→open period early, then close + compile.
-- Cron calendar path is unchanged when force_open_year_month is null and email_held is false.

alter table public.groups
  add column force_open_year_month text;

alter table public.groups
  add constraint groups_force_open_year_month_format
  check (
    force_open_year_month is null
    or force_open_year_month ~ '^\d{4}-\d{2}$'
  );

comment on column public.groups.force_open_year_month is
  'Owner force-open target (YYYY-MM). Null = unused; open/close follow the calendar.';

alter table public.capsules
  add column email_held boolean not null default false;

comment on column public.capsules.email_held is
  'Owner chose Not now after force close. Cron email_day must not send until the owner Sends later.';
