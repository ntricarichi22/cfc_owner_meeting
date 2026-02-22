-- =============================================================
-- Migration: Add new fields to proposals table
-- Run this in the Supabase SQL Editor.
-- =============================================================

-- Slide ordering independent of agenda items
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS order_index int NOT NULL DEFAULT 0;

-- Team that proposed it (matches Sleeper team names)
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS proposed_by text;

-- Proposal type: 'proposal' or 'admin'
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS proposal_type text NOT NULL DEFAULT 'proposal';

-- Pros and cons stored directly on the proposal (rich text)
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS pros text;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS cons text;

-- Constitution section references for deep-link chips (JSON array of section keys/ids)
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS article_sections jsonb DEFAULT '[]'::jsonb;
