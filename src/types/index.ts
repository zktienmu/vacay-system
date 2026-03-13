// === Session ===
export interface SessionData {
  employee_id: string;
  wallet_address: string;
  name: string;
  role: "admin" | "employee";
  nonce?: string;
  nonce_issued_at?: number; // Unix timestamp (ms) for nonce TTL enforcement
}

// === Database Models ===
export interface Employee {
  id: string;
  wallet_address: string;
  name: string;
  slack_user_id: string | null;
  start_date: string; // ISO date
  role: "admin" | "employee";
  created_at: string;
  updated_at: string;
}

export type LeaveType =
  | "annual"
  | "personal"
  | "sick"
  | "official"
  | "unpaid"
  | "remote";

export interface LeavePolicy {
  id: string;
  employee_id: string;
  leave_type: LeaveType;
  total_days: number;
  expires_at: string | null; // ISO datetime
  created_at: string;
  updated_at: string;
}

export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface LeaveRequest {
  id: string;
  employee_id: string;
  leave_type: LeaveType;
  start_date: string; // ISO date
  end_date: string; // ISO date
  days: number;
  delegate_id: string | null;
  notes: string | null;
  status: LeaveStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  calendar_event_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  actor_id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  details: Record<string, unknown> | null;
  ip_address: string | null;
}

// === API ===
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// === Extended types for UI ===
export interface LeaveRequestWithEmployee extends LeaveRequest {
  employee?: Employee;
  delegate?: Employee;
  reviewer?: Employee;
}

export interface LeaveBalance {
  leave_type: LeaveType;
  total_days: number;
  used_days: number;
  remaining_days: number;
}
