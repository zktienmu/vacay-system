-- Migration 006: Add missing columns that code references but were never created

-- Employees: transition period annual leave days
ALTER TABLE employees ADD COLUMN IF NOT EXISTS transition_annual_days INTEGER;

-- Employees: Asana integration (future)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS asana_user_gid TEXT;

-- Leave requests: multiple delegate IDs array
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS delegate_ids UUID[] DEFAULT ARRAY[]::UUID[];
