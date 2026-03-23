import type { SessionData, Employee, LeaveRequest, LeavePolicy } from '@/types'

// === Session Mocks ===

export function mockSession(overrides: Partial<SessionData> = {}): SessionData {
  return {
    employee_id: 'emp-001',
    wallet_address: '0x1234567890abcdef1234567890abcdef12345678',
    name: 'Test User',
    role: 'employee',
    department: 'engineering',
    is_manager: false,
    ...overrides,
  }
}

export function mockAdminSession(overrides: Partial<SessionData> = {}): SessionData {
  return mockSession({
    employee_id: 'admin-001',
    name: 'Admin User',
    role: 'admin',
    department: 'admin',
    is_manager: false,
    ...overrides,
  })
}

export function mockUnauthenticatedSession(): SessionData {
  return {
    employee_id: '',
    wallet_address: '',
    name: '',
    role: 'employee',
    department: 'engineering',
    is_manager: false,
  }
}

// === Employee Mocks ===

export function mockEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: 'emp-001',
    wallet_address: '0x1234567890abcdef1234567890abcdef12345678',
    name: 'Test User',
    slack_user_id: 'U12345',
    start_date: '2024-01-15',
    role: 'employee',
    department: 'engineering',
    is_manager: false,
    transition_annual_days: null,
    created_at: '2024-01-15T00:00:00Z',
    updated_at: '2024-01-15T00:00:00Z',
    ...overrides,
  }
}

// === Leave Request Mocks ===

export function mockLeaveRequest(overrides: Partial<LeaveRequest> = {}): LeaveRequest {
  return {
    id: 'lr-001',
    employee_id: 'emp-001',
    leave_type: 'annual',
    start_date: '2026-04-01',
    end_date: '2026-04-03',
    days: 3,
    delegate_id: null,
    delegate_ids: [],
    handover_url: null,
    notes: null,
    status: 'pending',
    reviewed_by: null,
    reviewed_at: null,
    calendar_event_id: null,
    created_at: '2026-03-20T00:00:00Z',
    updated_at: '2026-03-20T00:00:00Z',
    ...overrides,
  }
}

// === Leave Policy Mocks ===

export function mockLeavePolicy(overrides: Partial<LeavePolicy> = {}): LeavePolicy {
  return {
    id: 'policy-001',
    employee_id: 'emp-001',
    leave_type: 'annual',
    total_days: 20,
    expires_at: null,
    created_at: '2024-01-15T00:00:00Z',
    updated_at: '2024-01-15T00:00:00Z',
    ...overrides,
  }
}
