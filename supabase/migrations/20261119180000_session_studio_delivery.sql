-- Session revocation, studio-code rate limit, and one capsule-email claim per recipient.
-- Apply this on production before the app that reads these columns is deployed.
-- Access model unchanged: service role only.

alter table public.accounts
  add column if not exists session_version integer not null default 0;

comment on column public.accounts.session_version is
  'Bumped when the password changes or the account is banned. JWTs must carry the same number. 0 still accepts tokens minted before this column existed.';

create table if not exists public.studio_attempts (
  id uuid primary key default gen_random_uuid(),
  ip_hash text not null,
  attempted_at timestamptz not null default now()
);

comment on table public.studio_attempts is
  'Studio code rate limit (5 / 15 minutes / IP). Failures only.';

create index if not exists studio_attempts_lookup_idx
  on public.studio_attempts (ip_hash, attempted_at);

alter table public.studio_attempts enable row level security;
revoke all on table public.studio_attempts from anon, authenticated;

create table if not exists public.capsule_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  capsule_id uuid not null references public.capsules (id) on delete cascade,
  email_hash text not null,
  claimed_at timestamptz not null default now(),
  constraint capsule_email_deliveries_unique unique (capsule_id, email_hash)
);

comment on table public.capsule_email_deliveries is
  'Claimed before Resend is called so a retry cannot send the same capsule email twice. The hash is SHA-256 of the address. A failed send deletes the row. A timeout keeps it.';

create index if not exists capsule_email_deliveries_capsule_idx
  on public.capsule_email_deliveries (capsule_id);

alter table public.capsule_email_deliveries enable row level security;
revoke all on table public.capsule_email_deliveries from anon, authenticated;
