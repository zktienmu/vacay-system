ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS start_time TEXT;
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS end_time TEXT;
