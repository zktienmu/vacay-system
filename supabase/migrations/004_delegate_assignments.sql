-- Migration 004: Add delegate_assignments to leave_requests
-- Stores per-date delegate assignments as JSONB array

ALTER TABLE leave_requests
ADD COLUMN IF NOT EXISTS delegate_assignments jsonb DEFAULT '[]'::jsonb;
