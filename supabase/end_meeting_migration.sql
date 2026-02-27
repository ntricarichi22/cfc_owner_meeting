-- =============================================================
-- Migration: End Meeting support
-- Run this in the Supabase SQL Editor if meetings.finalized_at
-- does not already exist (it is present in the legacy db/init.sql
-- schema but absent from the MVP schema in mvp_schema.sql).
-- =============================================================

-- Add finalized_at to meetings if not present
alter table public.meetings
  add column if not exists finalized_at timestamptz null;
