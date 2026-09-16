-- Allow submit_start_day 1–31. Days 20–31 open the previous calendar month
-- (clamped in app code to that month's last day). Close and email_day stay
-- 1–28 of cycle month M. Chronology is open-datetime before close-datetime,
-- not start_day <= end_day, so open 25 (M−1) + close 5 (M) is valid.

alter table public.groups drop constraint groups_schedule_valid;

alter table public.groups add constraint groups_schedule_valid check (
  submit_start_day >= 1
  and submit_start_day <= 31
  and submit_end_day >= 1
  and submit_end_day <= 28
  and submit_end_day < email_day
  and email_day <= 28
  and (
    submit_start_day >= 20
    or submit_start_day <= submit_end_day
  )
);

comment on column public.groups.submit_start_day is
  'Day the submit window opens (America/Chicago). 1–19 = cycle month M; 20–31 = previous month, clamped to that month''s last day.';
comment on column public.groups.submit_end_day is
  'Day of cycle month M the submit window closes, inclusive (America/Chicago). Current month only.';
comment on column public.groups.email_day is
  'Day of cycle month M the capsule email is sent (America/Chicago). Current month only.';
