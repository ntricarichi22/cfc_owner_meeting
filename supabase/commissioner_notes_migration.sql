-- Migration: Add commissioner_notes column to proposals table
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS commissioner_notes text;
