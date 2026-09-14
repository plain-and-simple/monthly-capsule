-- Password reset tokens + rate limit.
-- Access model unchanged: service role only. Anon / authenticated have no grants.
-- Raw tokens never land in the database — only SHA-256 hashes.

create table public.password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.password_reset_tokens is
  'Single-use, short-lived password reset. token_hash is SHA-256 of the secret in the email link.';
comment on column public.password_reset_tokens.token_hash is
  'Hex SHA-256 of the raw token. The raw token is emailed once and never stored.';
comment on column public.password_reset_tokens.expires_at is
  'Hard expiry. Unused tokens are also marked used when a newer reset is issued.';
comment on column public.password_reset_tokens.used_at is
  'Set when the password is changed, or when a later reset for the same account supersedes this row.';

create unique index password_reset_tokens_hash_unique
  on public.password_reset_tokens (token_hash);

create index password_reset_tokens_account_unused_idx
  on public.password_reset_tokens (account_id)
  where used_at is null;

create table public.password_reset_attempts (
  id uuid primary key default gen_random_uuid(),
  email_norm text not null,
  ip_hash text not null,
  attempted_at timestamptz not null default now()
);

comment on table public.password_reset_attempts is
  'Forgot-password rate limit (5 / 15 minutes / IP + email). Counted whether or not the account exists.';

create index password_reset_attempts_lookup_idx
  on public.password_reset_attempts (email_norm, ip_hash, attempted_at);

alter table public.password_reset_tokens enable row level security;
alter table public.password_reset_attempts enable row level security;

revoke all on table public.password_reset_tokens from anon, authenticated;
revoke all on table public.password_reset_attempts from anon, authenticated;
