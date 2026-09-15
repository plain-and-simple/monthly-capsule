-- Owner kick + account-level ban.
-- Access model unchanged: service role only. Anon / authenticated have no grants.
-- Rows are kept (no deletes) so compiled capsule archives and past submissions stay.

alter table public.members
  add column removed_at timestamptz;

comment on column public.members.removed_at is
  'Set when the owner removes this seat. Null = active membership. The row stays so past submissions and compiled archives are not deleted.';

drop index if exists public.members_account_group_unique;
create unique index members_account_group_unique
  on public.members (account_id, group_id)
  where account_id is not null and removed_at is null;

drop index if exists public.members_group_email_unique;
create unique index members_group_email_unique
  on public.members (group_id, email)
  where email is not null and removed_at is null;

create index members_group_active_idx
  on public.members (group_id)
  where removed_at is null;

alter table public.accounts
  add column banned_at timestamptz;

comment on column public.accounts.banned_at is
  'Account-level ban set by studio. Null = not banned. Manage login, submit, create, and join all fail. Reversible by clearing this column.';
