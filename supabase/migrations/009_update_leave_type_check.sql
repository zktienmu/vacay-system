-- Migration 009: Update leave_type CHECK constraints to include new types
-- and remove deleted types (official, unpaid)

ALTER TABLE leave_requests DROP CONSTRAINT IF EXISTS leave_requests_leave_type_check;
ALTER TABLE leave_requests ADD CONSTRAINT leave_requests_leave_type_check
  CHECK (leave_type IN ('annual', 'personal', 'sick', 'remote', 'family_care', 'menstrual'));

ALTER TABLE leave_policies DROP CONSTRAINT IF EXISTS leave_policies_leave_type_check;
ALTER TABLE leave_policies ADD CONSTRAINT leave_policies_leave_type_check
  CHECK (leave_type IN ('annual', 'personal', 'sick', 'remote', 'family_care', 'menstrual'));
