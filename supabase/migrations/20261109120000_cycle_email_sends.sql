-- Open and reminder emails: at most once per member per group-month.
-- Stamps stay when the owner later changes submit-window dates, so a new
-- open or reminder day never re-sends.

create table public.cycle_email_sends (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  year_month text not null,
  member_id uuid not null references public.members (id) on delete cascade,
  open_email_sent_at timestamptz,
  reminder_email_sent_at timestamptz,
  constraint cycle_email_sends_year_month_format check (year_month ~ '^\d{4}-\d{2}$'),
  constraint cycle_email_sends_group_month_member_unique unique (group_id, year_month, member_id)
);

create index cycle_email_sends_group_month_idx
  on public.cycle_email_sends (group_id, year_month);

comment on table public.cycle_email_sends is
  'Per-member stamps for submit-window open and reminder emails. Null means not sent.';
comment on column public.cycle_email_sends.open_email_sent_at is
  'When Resend accepted the open-window email. Once set, never send again for this member and group-month.';
comment on column public.cycle_email_sends.reminder_email_sent_at is
  'When Resend accepted the closing-soon reminder. Once set, never send again for this member and group-month.';

alter table public.cycle_email_sends enable row level security;
revoke all on table public.cycle_email_sends from anon, authenticated;
