-- Optional Slack awards drafts. Additive only.
-- Does not change letters, submissions, or any existing column.

alter table public.groups
  add column slack_awards_enabled boolean not null default false;

comment on column public.groups.slack_awards_enabled is
  'When true, this group may include a Slack awards section in the capsule.';

create table public.group_slack_awards (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  year_month text not null,
  data jsonb not null default '{}'::jsonb,
  owner_edited boolean not null default false,
  hidden boolean not null default false,
  generated_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint group_slack_awards_year_month_format check (year_month ~ '^\d{4}-\d{2}$'),
  constraint group_slack_awards_data_object check (jsonb_typeof(data) = 'object'),
  constraint group_slack_awards_group_month_unique unique (group_id, year_month)
);

comment on table public.group_slack_awards is
  'Draft Slack awards for one capsule cycle. The service role writes generated rows. Owner edits set owner_edited and must not be replaced unless the owner confirms.';

comment on column public.group_slack_awards.year_month is
  'Capsule cycle key (YYYY-MM). Counted Slack history is the writing month, one calendar month earlier, in America/Chicago.';

comment on column public.group_slack_awards.owner_edited is
  'When true, a generated refresh must not replace data unless the owner confirms.';

comment on column public.group_slack_awards.hidden is
  'When true, the capsule omits the Slack awards section for this cycle.';

comment on column public.group_slack_awards.data is
  'Editable awards payload: sender places, top channel, most-replied quote, most-reacted quote.';

alter table public.group_slack_awards enable row level security;

revoke all on table public.group_slack_awards from anon, authenticated;

-- Owners and admins of the group may read and update through PostgREST.
-- Inserts stay with the service role (no insert policy). The service role bypasses RLS.
grant select, update on table public.group_slack_awards to authenticated;

create policy group_slack_awards_owner_select
  on public.group_slack_awards
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.members
      where members.group_id = group_slack_awards.group_id
        and members.account_id = auth.uid()
        and members.removed_at is null
        and members.role in ('owner', 'admin')
    )
  );

create policy group_slack_awards_owner_update
  on public.group_slack_awards
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.members
      where members.group_id = group_slack_awards.group_id
        and members.account_id = auth.uid()
        and members.removed_at is null
        and members.role in ('owner', 'admin')
    )
  )
  with check (
    exists (
      select 1
      from public.members
      where members.group_id = group_slack_awards.group_id
        and members.account_id = auth.uid()
        and members.removed_at is null
        and members.role in ('owner', 'admin')
    )
  );
