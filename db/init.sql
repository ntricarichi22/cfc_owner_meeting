-- CFC Owners Meeting - Database Schema
-- Apply this to your Supabase project via SQL Editor or CLI

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ============================================================
-- TABLES
-- ============================================================

create table if not exists leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

create table if not exists owners (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues(id) on delete cascade,
  display_name text not null,
  email text,
  team_name text not null,
  role text not null check (role in ('commissioner','owner')),
  created_at timestamptz default now()
);

create table if not exists meetings (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues(id),
  club_year int not null,
  meeting_date date,
  status text not null check (status in ('draft','live','finalized')),
  current_agenda_item_id uuid null,
  created_at timestamptz default now(),
  finalized_at timestamptz null,
  unique(league_id, club_year)
);

create table if not exists agenda_sections (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid references meetings(id) on delete cascade,
  title text not null,
  sort_order int default 0,
  created_at timestamptz default now()
);

create table if not exists agenda_items (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid references meetings(id) on delete cascade,
  section_id uuid null references agenda_sections(id) on delete set null,
  type text not null check (type in ('proposal','admin')),
  title text not null,
  presenter_owner_id uuid null references owners(id) on delete set null,
  sort_order int default 0,
  voting_required boolean not null default true,
  timer_duration_seconds int null,
  timer_started_at timestamptz null,
  timer_paused_at timestamptz null,
  timer_remaining_seconds int null,
  status text not null check (status in ('not_started','in_discussion','voting_open','voting_closed','tallied','finalized')),
  created_at timestamptz default now()
);

-- Add FK from meetings.current_agenda_item_id after agenda_items exists
alter table meetings
  add constraint fk_current_agenda_item
  foreign key (current_agenda_item_id)
  references agenda_items(id)
  on delete set null;

create table if not exists proposals (
  id uuid primary key default gen_random_uuid(),
  agenda_item_id uuid not null unique references agenda_items(id) on delete cascade,
  summary text,
  pros text,
  cons text,
  effective_date text,
  created_at timestamptz default now()
);

create table if not exists proposal_versions (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references proposals(id) on delete cascade,
  version_number int not null,
  full_text text not null,
  created_by_owner_id uuid null references owners(id) on delete set null,
  status text not null check (status in ('draft','active','superseded','final')),
  created_at timestamptz default now(),
  unique(proposal_id, version_number)
);

create table if not exists amendments (
  id uuid primary key default gen_random_uuid(),
  proposal_version_id uuid not null references proposal_versions(id) on delete cascade,
  suggested_text text not null,
  rationale text,
  submitted_by_owner_id uuid null references owners(id) on delete set null,
  status text not null default 'submitted',
  created_at timestamptz default now()
);

create table if not exists votes (
  id uuid primary key default gen_random_uuid(),
  proposal_version_id uuid not null references proposal_versions(id) on delete cascade,
  owner_id uuid not null references owners(id) on delete cascade,
  choice text not null check (choice in ('yes','no')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(proposal_version_id, owner_id)
);

-- updated_at trigger for votes
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger votes_updated_at
  before update on votes
  for each row execute function update_updated_at_column();

-- Constitution tables
create table if not exists constitution_articles (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues(id) on delete cascade,
  club_year int not null,
  article_num text not null,
  article_title text not null,
  sort_order int default 0,
  unique(league_id, club_year, article_num)
);

create table if not exists constitution_sections (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references constitution_articles(id) on delete cascade,
  section_num text not null,
  section_title text not null,
  body text not null,
  anchor text not null,
  sort_order int default 0,
  unique(article_id, anchor)
);

create table if not exists proposal_constitution_links (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references proposals(id) on delete cascade,
  constitution_section_id uuid not null references constitution_sections(id) on delete cascade
);

-- Post-meeting minutes
create table if not exists meeting_minutes (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null unique references meetings(id) on delete cascade,
  minutes_markdown text not null,
  email_subject text,
  email_body_html text,
  emailed_at timestamptz null
);

create table if not exists team_sessions (
  id uuid primary key default gen_random_uuid(),
  team_id text not null,
  team_name text not null,
  created_at timestamptz default now()
);

-- ============================================================
-- RPC FUNCTIONS
-- ============================================================

-- Used by /api/schema-check to inspect public table columns
create or replace function get_public_columns()
returns table(table_name text, column_name text)
language sql
security definer
as $$
  select c.table_name::text, c.column_name::text
  from information_schema.columns c
  where c.table_schema = 'public';
$$;

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists idx_owners_league on owners(league_id);
create index if not exists idx_owners_team on owners(team_name);
create index if not exists idx_meetings_league on meetings(league_id);
create index if not exists idx_agenda_items_meeting on agenda_items(meeting_id);
create index if not exists idx_proposals_agenda on proposals(agenda_item_id);
create index if not exists idx_proposal_versions_proposal on proposal_versions(proposal_id);
create index if not exists idx_amendments_version on amendments(proposal_version_id);
create index if not exists idx_votes_version on votes(proposal_version_id);
create index if not exists idx_votes_owner on votes(owner_id);
create index if not exists idx_constitution_articles_league on constitution_articles(league_id);
create index if not exists idx_constitution_sections_article on constitution_sections(article_id);
create index if not exists idx_team_sessions_team on team_sessions(team_id, created_at);

-- ============================================================
-- REALTIME (enable for live meeting sync)
-- ============================================================
-- Run these in Supabase SQL editor:
-- alter publication supabase_realtime add table meetings;
-- alter publication supabase_realtime add table agenda_items;
-- alter publication supabase_realtime add table votes;
-- alter publication supabase_realtime add table amendments;
