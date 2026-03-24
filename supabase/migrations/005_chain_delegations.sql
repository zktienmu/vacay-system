-- Migration 005: Add chain_delegations to leave_requests
-- Stores targeted chain delegation reassignments as JSONB array

ALTER TABLE leave_requests
ADD COLUMN IF NOT EXISTS chain_delegations jsonb DEFAULT '[]'::jsonb;
