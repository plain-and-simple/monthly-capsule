-- Accounts (Manage login) + memberships (members.account_id).
-- Access model unchanged: service role only. Anon / authenticated have no grants.
-- Join without Save login stays a group session: members.account_id is null.

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  preferred_name text not null,
  email text not null,
  password_hash text not null,
  created_at timestamptz not null default now(),
  constraint accounts_preferred_name_len check (
    char_length(preferred_name) >= 1
    and char_length(preferred_name) <= 40
  ),
  constraint accounts_email_len check (
    char_length(email) >= 3
    and char_length(email) <= 254
  )
);

comment on table public.accounts is
  'Manage login. One name field (preferred_name), email, hashed password. No phone or SMS.';
comment on column public.accounts.preferred_name is
  'The one name field. No first/last split.';
comment on column public.accounts.email is
  'Normalized lowercase email. Unique. Used for Manage, never shown on People.';
comment on column public.accounts.password_hash is
  'bcrypt. Minimum length is enforced in the app (8).';

create unique index accounts_email_unique on public.accounts (email);

alter table public.members rename column display_name to preferred_name;

comment on column public.members.preferred_name is
  'Name shown on People and capsules. Not an email.';

alter table public.members
  add column account_id uuid references public.accounts (id) on delete set null;

comment on column public.members.account_id is
  'Membership: links this group seat to a Manage account. Null = join without Save login.';

create unique index members_account_group_unique
  on public.members (account_id, group_id)
  where account_id is not null;

create table public.login_attempts (
  id uuid primary key default gen_random_uuid(),
  email_norm text not null,
  ip_hash text not null,
  attempted_at timestamptz not null default now()
);

comment on table public.login_attempts is
  'Manage login rate limit (5 / 15 minutes / IP + email).';

create index login_attempts_lookup_idx
  on public.login_attempts (email_norm, ip_hash, attempted_at);

alter table public.accounts enable row level security;
alter table public.login_attempts enable row level security;

revoke all on table public.accounts from anon, authenticated;
revoke all on table public.login_attempts from anon, authenticated;
