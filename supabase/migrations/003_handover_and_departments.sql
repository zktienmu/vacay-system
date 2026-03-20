-- Migration 003: Handover URL, Department, and Manager roles
-- Feature 1: handover_url on leave_requests
-- Feature 3: department and is_manager on employees

-- Add handover_url to leave_requests
ALTER TABLE leave_requests ADD COLUMN handover_url TEXT;

-- Add department to employees
ALTER TABLE employees ADD COLUMN department TEXT NOT NULL DEFAULT 'engineering'
  CHECK (department IN ('engineering', 'admin'));

-- Add is_manager flag to employees
ALTER TABLE employees ADD COLUMN is_manager BOOLEAN NOT NULL DEFAULT false;
