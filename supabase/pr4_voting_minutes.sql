create extension if not exists "pgcrypto";

create table if not exists public.proposal_vote_sessions (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null,
  proposal_id uuid not null,
  proposal_version_id uuid not null unique,
  status text not null default 'not_open',
  opened_at timestamptz null,
  closed_at timestamptz null,
  tallied_at timestamptz null,
  opened_by_team text null,
  closed_by_team text null,
  tallied_by_team text null,
  yes_count int not null default 0,
  no_count int not null default 0,
  abstain_count int not null default 0,
  total_count int not null default 0,
  passed boolean null,
  created_at timestamptz not null default now(),
  constraint proposal_vote_sessions_status_check check (status in ('not_open','open','closed','tallied'))
);

create index if not exists idx_proposal_vote_sessions_meeting_id on public.proposal_vote_sessions(meeting_id);
create index if not exists idx_proposal_vote_sessions_proposal_id on public.proposal_vote_sessions(proposal_id);
create index if not exists idx_proposal_vote_sessions_status on public.proposal_vote_sessions(status);

create table if not exists public.meeting_minutes (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null unique,
  minutes_markdown text not null default '',
  checklist_markdown text not null default '',
  finalized_at timestamptz null,
  finalized_by_team text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'votes_vote_check'
      and conrelid = 'public.votes'::regclass
  ) then
    alter table public.votes drop constraint votes_vote_check;
  end if;
exception
  when undefined_table then
    null;
end
$$;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'votes')
    and not exists (
      select 1
      from pg_constraint
      where conname = 'votes_vote_check'
        and conrelid = 'public.votes'::regclass
    ) then
    alter table public.votes
      add constraint votes_vote_check check (vote in ('yes','no','abstain'));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'set_meeting_minutes_updated_at'
  ) then
    create trigger set_meeting_minutes_updated_at
      before update on public.meeting_minutes
      for each row
      execute function public.set_updated_at_timestamp();
  end if;
end
$$;
