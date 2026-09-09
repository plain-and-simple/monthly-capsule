-- Monthly Capsule v1 schema
-- Access model: custom PIN sessions in the Next.js app.
-- All table I/O goes through server actions / route handlers using the
-- service role (bypasses RLS). Anon and authenticated have no table grants.
-- Photos live in a private Storage bucket; the app mints signed URLs.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- groups
-- ---------------------------------------------------------------------------
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  pin_hash text not null,
  submit_start_day integer not null default 1,
  submit_end_day integer not null default 8,
  email_day integer not null default 9,
  created_at timestamptz not null default now(),
  constraint groups_schedule_valid check (
    submit_start_day >= 1
    and submit_start_day <= submit_end_day
    and submit_end_day <= 28
    and submit_end_day < email_day
    and email_day <= 28
  )
);

comment on table public.groups is 'A friends group. PIN is stored hashed only.';
comment on column public.groups.submit_start_day is 'Day of month submit window opens (America/Chicago).';
comment on column public.groups.submit_end_day is 'Day of month submit window closes, inclusive (America/Chicago).';
comment on column public.groups.email_day is 'Day of month capsule email is sent (America/Chicago).';

-- ---------------------------------------------------------------------------
-- members
-- ---------------------------------------------------------------------------
create table public.members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  display_name text not null,
  email text,
  role text not null,
  joined_at timestamptz not null default now(),
  constraint members_role_check check (role in ('owner', 'member'))
);

create index members_group_id_idx on public.members (group_id);

create unique index members_group_email_unique
  on public.members (group_id, email)
  where email is not null;

-- ---------------------------------------------------------------------------
-- months
-- ---------------------------------------------------------------------------
create table public.months (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  year_month text not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  constraint months_status_check check (status in ('open', 'closed', 'compiled')),
  constraint months_year_month_format check (year_month ~ '^\d{4}-\d{2}$'),
  constraint months_group_year_month_unique unique (group_id, year_month)
);

create index months_group_id_idx on public.months (group_id);

-- ---------------------------------------------------------------------------
-- submissions
-- ---------------------------------------------------------------------------
create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  month_id uuid not null references public.months (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  body text not null default '',
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint submissions_month_member_unique unique (month_id, member_id)
);

create index submissions_month_id_idx on public.submissions (month_id);
create index submissions_member_id_idx on public.submissions (member_id);

-- ---------------------------------------------------------------------------
-- photos
-- ---------------------------------------------------------------------------
create table public.photos (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  storage_path text not null,
  width integer not null,
  height integer not null,
  bytes integer not null,
  sort_order integer not null default 0,
  constraint photos_width_positive check (width > 0),
  constraint photos_height_positive check (height > 0),
  constraint photos_bytes_positive check (bytes > 0)
);

create index photos_submission_id_idx on public.photos (submission_id);

-- ---------------------------------------------------------------------------
-- capsules
-- ---------------------------------------------------------------------------
create table public.capsules (
  id uuid primary key default gen_random_uuid(),
  month_id uuid not null references public.months (id) on delete cascade,
  compiled_at timestamptz not null default now(),
  email_sent_at timestamptz,
  constraint capsules_month_id_unique unique (month_id)
);

create index capsules_month_id_idx on public.capsules (month_id);

-- ---------------------------------------------------------------------------
-- pin_attempts (rate limit)
-- ---------------------------------------------------------------------------
create table public.pin_attempts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  ip_hash text not null,
  attempted_at timestamptz not null default now()
);

create index pin_attempts_lookup_idx
  on public.pin_attempts (group_id, ip_hash, attempted_at);

-- ---------------------------------------------------------------------------
-- RLS: lock down PostgREST. Service role bypasses these policies.
-- Members only reach data through server actions that verify PIN / session.
-- ---------------------------------------------------------------------------
alter table public.groups enable row level security;
alter table public.members enable row level security;
alter table public.months enable row level security;
alter table public.submissions enable row level security;
alter table public.photos enable row level security;
alter table public.capsules enable row level security;
alter table public.pin_attempts enable row level security;

revoke all on table public.groups from anon, authenticated;
revoke all on table public.members from anon, authenticated;
revoke all on table public.months from anon, authenticated;
revoke all on table public.submissions from anon, authenticated;
revoke all on table public.photos from anon, authenticated;
revoke all on table public.capsules from anon, authenticated;
revoke all on table public.pin_attempts from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage: private photos bucket
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'capsule-photos',
  'capsule-photos',
  false,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- No storage.objects policies for anon/authenticated.
-- Uploads and signed URLs use the service role from the Next.js server.
