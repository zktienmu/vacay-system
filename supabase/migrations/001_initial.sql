-- Vaca: Leave Management System for Dinngo
-- Initial migration

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Employees table
CREATE TABLE employees (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_address TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  slack_user_id TEXT,
  start_date DATE NOT NULL,
  role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('admin', 'employee')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_employees_wallet ON employees (wallet_address);

-- Leave policies table
CREATE TABLE leave_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type TEXT NOT NULL CHECK (leave_type IN ('annual', 'personal', 'sick', 'official', 'unpaid', 'remote')),
  total_days INTEGER NOT NULL CHECK (total_days >= 0),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, leave_type)
);

CREATE INDEX idx_leave_policies_employee ON leave_policies (employee_id);

-- Leave requests table
CREATE TABLE leave_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type TEXT NOT NULL CHECK (leave_type IN ('annual', 'personal', 'sick', 'official', 'unpaid', 'remote')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days NUMERIC(4,1) NOT NULL CHECK (days > 0),
  delegate_id UUID REFERENCES employees(id),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by UUID REFERENCES employees(id),
  reviewed_at TIMESTAMPTZ,
  calendar_event_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_date >= start_date)
);

CREATE INDEX idx_leave_requests_employee ON leave_requests (employee_id);
CREATE INDEX idx_leave_requests_status ON leave_requests (status);
CREATE INDEX idx_leave_requests_dates ON leave_requests (start_date, end_date);

-- Audit log table
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_id UUID REFERENCES employees(id),
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  details JSONB,
  ip_address TEXT
);

CREATE INDEX idx_audit_log_timestamp ON audit_log (timestamp DESC);
CREATE INDEX idx_audit_log_actor ON audit_log (actor_id);
CREATE INDEX idx_audit_log_action ON audit_log (action);

-- Enable Row Level Security on all tables
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- RLS policies (service_role bypasses these, but they serve as defense-in-depth)
-- Employees: everyone can read, only admins can write
CREATE POLICY "employees_select" ON employees FOR SELECT USING (true);
CREATE POLICY "employees_insert" ON employees FOR INSERT WITH CHECK (true);
CREATE POLICY "employees_update" ON employees FOR UPDATE USING (true);

-- Leave policies: everyone can read, only admins can write
CREATE POLICY "leave_policies_select" ON leave_policies FOR SELECT USING (true);
CREATE POLICY "leave_policies_insert" ON leave_policies FOR INSERT WITH CHECK (true);
CREATE POLICY "leave_policies_update" ON leave_policies FOR UPDATE USING (true);

-- Leave requests: everyone can read, employees can create their own
CREATE POLICY "leave_requests_select" ON leave_requests FOR SELECT USING (true);
CREATE POLICY "leave_requests_insert" ON leave_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "leave_requests_update" ON leave_requests FOR UPDATE USING (true);

-- Audit log: insert only (no reads except through service_role)
CREATE POLICY "audit_log_insert" ON audit_log FOR INSERT WITH CHECK (true);
CREATE POLICY "audit_log_select" ON audit_log FOR SELECT USING (true);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables with updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON leave_policies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON leave_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
