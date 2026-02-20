-- =============================================================
-- CFC Owners Meeting – MVP Schema
-- Run this entire file in the Supabase SQL Editor (one shot).
-- =============================================================

-- Enable UUID generation (idempotent)
create extension if not exists "pgcrypto";

-- ============================================================
-- 1. constitution_sections
-- ============================================================
create table if not exists constitution_sections (
  id            uuid primary key default gen_random_uuid(),
  section_key   text not null unique,
  title         text not null,
  body          text not null default '',
  updated_at    timestamptz not null default now()
);

-- ============================================================
-- 2. meetings
-- ============================================================
create table if not exists meetings (
  id          uuid primary key default gen_random_uuid(),
  year        int not null unique,
  title       text not null,
  status      text not null default 'draft'
                check (status in ('draft','live','finalized')),
  locked      boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- 3. agenda_items
-- ============================================================
create table if not exists agenda_items (
  id           uuid primary key default gen_random_uuid(),
  meeting_id   uuid not null references meetings(id) on delete cascade,
  order_index  int not null default 0,
  category     text not null default 'general',
  title        text not null,
  created_at   timestamptz not null default now()
);

-- ============================================================
-- 4. proposals
-- ============================================================
create table if not exists proposals (
  id              uuid primary key default gen_random_uuid(),
  meeting_id      uuid not null references meetings(id) on delete cascade,
  agenda_item_id  uuid references agenda_items(id) on delete set null,
  title           text not null,
  summary         text,
  effective_date  text,
  status          text not null default 'draft'
                    check (status in ('draft','open','passed','failed','tabled')),
  created_at      timestamptz not null default now()
);

-- ============================================================
-- 5. proposal_versions
-- ============================================================
create table if not exists proposal_versions (
  id               uuid primary key default gen_random_uuid(),
  proposal_id      uuid not null references proposals(id) on delete cascade,
  version_number   int not null,
  full_text        text not null,
  rationale        text,
  created_by_team  text,
  created_at       timestamptz not null default now(),
  is_active        boolean not null default true,
  unique (proposal_id, version_number)
);

-- ============================================================
-- 6. amendments
-- ============================================================
create table if not exists amendments (
  id                uuid primary key default gen_random_uuid(),
  proposal_id       uuid not null references proposals(id) on delete cascade,
  proposed_text     text not null,
  rationale         text,
  submitted_by_team text,
  created_at        timestamptz not null default now(),
  status            text not null default 'pending'
                      check (status in ('pending','submitted','accepted','rejected','withdrawn'))
);

-- ============================================================
-- 7. votes
-- ============================================================
create table if not exists votes (
  id                  uuid primary key default gen_random_uuid(),
  proposal_version_id uuid not null references proposal_versions(id) on delete cascade,
  team_id             text not null,
  team_name           text not null,
  vote                text not null check (vote in ('yes','no')),
  created_at          timestamptz not null default now(),
  unique (proposal_version_id, team_id)
);

-- ============================================================
-- 8. audit_events
-- ============================================================
create table if not exists audit_events (
  id            uuid primary key default gen_random_uuid(),
  meeting_id    uuid not null references meetings(id) on delete cascade,
  proposal_id   uuid references proposals(id) on delete set null,
  event_type    text not null,
  payload_json  jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
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
create index if not exists idx_agenda_items_meeting    on agenda_items(meeting_id);
create index if not exists idx_proposals_meeting       on proposals(meeting_id);
create index if not exists idx_proposals_agenda_item   on proposals(agenda_item_id);
create index if not exists idx_pv_proposal             on proposal_versions(proposal_id);
create index if not exists idx_amendments_proposal     on amendments(proposal_id);
create index if not exists idx_votes_version           on votes(proposal_version_id);
create index if not exists idx_audit_meeting           on audit_events(meeting_id);
create index if not exists idx_audit_proposal          on audit_events(proposal_id);

-- ============================================================
-- SEED DATA
-- ============================================================

-- One meeting for the current year
insert into meetings (id, year, title, status)
values (
  'b0000000-0000-0000-0000-000000000001',
  extract(year from now())::int,
  'Annual Owners Meeting ' || extract(year from now())::int,
  'draft'
);

-- A few agenda items
insert into agenda_items (id, meeting_id, order_index, category, title) values
  ('c0000000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-000000000001', 1, 'general',  'Welcome & Roll Call'),
  ('c0000000-0000-0000-0000-000000000002',
   'b0000000-0000-0000-0000-000000000001', 2, 'proposal', 'Salary Cap Increase'),
  ('c0000000-0000-0000-0000-000000000003',
   'b0000000-0000-0000-0000-000000000001', 3, 'proposal', 'Expanded Playoff Bracket'),
  ('c0000000-0000-0000-0000-000000000004',
   'b0000000-0000-0000-0000-000000000001', 4, 'general',  'Commissioner Updates');

-- Two sample proposals linked to agenda items
insert into proposals (id, meeting_id, agenda_item_id, title, summary, effective_date, status) values
  ('d0000000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000002',
   'Raise the Salary Cap',
   'Increase the salary cap from $200 to $250 starting next season.',
   '2026 Season',
   'draft'),
  ('d0000000-0000-0000-0000-000000000002',
   'b0000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000003',
   'Expand Playoffs to 8 Teams',
   'Move from a 6-team to an 8-team playoff bracket.',
   '2026 Season',
   'draft');

-- V1 versions for each proposal
insert into proposal_versions (id, proposal_id, version_number, full_text, rationale, created_by_team, is_active) values
  ('e0000000-0000-0000-0000-000000000001',
   'd0000000-0000-0000-0000-000000000001',
   1,
   'The salary cap shall be increased from $200 to $250 effective for the 2026 season. All existing contracts remain valid under the new cap.',
   'Rising player costs have made the current $200 cap too restrictive for competitive roster building.',
   'Virginia Founders',
   true),
  ('e0000000-0000-0000-0000-000000000002',
   'd0000000-0000-0000-0000-000000000002',
   1,
   'The playoff bracket shall expand from 6 teams to 8 teams beginning in the 2026 season. Seeds 7 and 8 will play in a new Wild Card round during Week 15.',
   'An 8-team bracket gives more owners a realistic shot at the postseason and increases late-season engagement.',
   'Virginia Founders',
   true);
