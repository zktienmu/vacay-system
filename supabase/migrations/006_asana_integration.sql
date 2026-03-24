-- Migration 006: Add Asana integration fields
-- asana_user_gid on employees for mapping to Asana users
-- asana_task_ids on leave_requests for tracking created handover tasks

ALTER TABLE employees
ADD COLUMN IF NOT EXISTS asana_user_gid text DEFAULT NULL;

ALTER TABLE leave_requests
ADD COLUMN IF NOT EXISTS asana_task_ids jsonb DEFAULT '[]'::jsonb;
