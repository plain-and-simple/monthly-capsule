-- Submit model A: drafts are saved but hidden from the compiled capsule.
-- Existing rows stay included (default 'submitted').

alter table public.submissions
  add column if not exists status text not null default 'submitted';

alter table public.submissions
  drop constraint if exists submissions_status_check;

alter table public.submissions
  add constraint submissions_status_check
  check (status in ('draft', 'submitted'));

comment on column public.submissions.status is
  'draft = saved and hidden from the capsule; submitted = included. Editable until the window closes.';
