-- Add last_seen_at column for heartbeat-based session TTL
alter table team_sessions
  add column if not exists last_seen_at timestamptz default now();

-- Backfill existing rows
update team_sessions set last_seen_at = created_at where last_seen_at is null;
