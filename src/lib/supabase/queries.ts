import "server-only";
// ARCHITECTURE NOTE (C3): The app uses the Supabase service_role key, which
// bypasses RLS. Authorization is enforced at the API layer instead (withAuth /
// withAdmin middleware + employee_id filters in queries). All non-admin queries
// must include appropriate employee_id filters to prevent cross-tenant access.
import { getAddress } from "viem";
import { supabase } from "@/lib/supabase/client";
import type {
  Employee,
  LeavePolicy,
  LeaveRequest,
  LeaveType,
  LeaveStatus,
  AuditLog,
  PublicHoliday,
} from "@/types";

// === Employees ===

export async function getEmployeeByWallet(
  wallet: string,
): Promise<Employee | null> {
  const checksumAddress = getAddress(wallet);
  const { data, error } = await supabase
    .from("employees")
    .select("*")
    .eq("wallet_address", checksumAddress)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // not found
    throw error;
  }

  return data as Employee;
}

export async function getEmployeeById(
  id: string,
): Promise<Employee | null> {
  const { data, error } = await supabase
    .from("employees")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }

  return data as Employee;
}

export async function getAdminCount(): Promise<number> {
  const { count, error } = await supabase
    .from("employees")
    .select("*", { count: "exact", head: true })
    .eq("role", "admin");

  if (error) throw error;
  return count ?? 0;
}

export async function getAllEmployees(): Promise<Employee[]> {
  const { data, error } = await supabase
    .from("employees")
    .select("*")
    .order("name", { ascending: true });

  if (error) throw error;
  return (data ?? []) as Employee[];
}

export async function getEmployeesByIds(
  ids: string[],
): Promise<Employee[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("employees")
    .select("*")
    .in("id", ids);

  if (error) throw error;
  return (data ?? []) as Employee[];
}

export async function createEmployee(
  employeeData: Omit<Employee, "id" | "created_at" | "updated_at">,
): Promise<Employee> {
  const { data, error } = await supabase
    .from("employees")
    .insert({
      ...employeeData,
      wallet_address: getAddress(employeeData.wallet_address),
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as Employee;
}

export async function updateEmployee(
  id: string,
  updates: Partial<Omit<Employee, "id" | "created_at" | "updated_at">>,
): Promise<Employee> {
  const payload: Record<string, unknown> = { ...updates };
  if (updates.wallet_address) {
    payload.wallet_address = getAddress(updates.wallet_address);
  }

  const { data, error } = await supabase
    .from("employees")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return data as Employee;
}

export async function deleteEmployee(id: string): Promise<void> {
  const { error } = await supabase
    .from("employees")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

// === Leave Policies ===

export async function getLeavePolicies(
  employeeId: string,
): Promise<LeavePolicy[]> {
  const { data, error } = await supabase
    .from("leave_policies")
    .select("*")
    .eq("employee_id", employeeId)
    .order("leave_type", { ascending: true });

  if (error) throw error;
  return (data ?? []) as LeavePolicy[];
}

export async function upsertLeavePolicy(
  policyData: Omit<LeavePolicy, "id" | "created_at" | "updated_at">,
): Promise<LeavePolicy> {
  const { data, error } = await supabase
    .from("leave_policies")
    .upsert(policyData, {
      onConflict: "employee_id,leave_type",
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as LeavePolicy;
}

// === Leave Requests ===

export async function getLeaveRequests(filters: {
  employee_id?: string;
  status?: LeaveStatus;
  start_date?: string;
  end_date?: string;
}): Promise<LeaveRequest[]> {
  let query = supabase
    .from("leave_requests")
    .select("*")
    .order("start_date", { ascending: false });

  if (filters.employee_id) {
    query = query.eq("employee_id", filters.employee_id);
  }
  if (filters.status) {
    query = query.eq("status", filters.status);
  }
  if (filters.start_date) {
    query = query.gte("start_date", filters.start_date);
  }
  if (filters.end_date) {
    query = query.lte("end_date", filters.end_date);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    delegate_ids: [],
    delegate_assignments: [],
    chain_delegations: [],
    serial_number: null,
    ...r,
  })) as unknown as LeaveRequest[];
}

export async function getLeaveRequestById(
  id: string,
): Promise<LeaveRequest | null> {
  const { data, error } = await supabase
    .from("leave_requests")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }

  return { delegate_ids: [], delegate_assignments: [], chain_delegations: [], serial_number: null, ...data } as LeaveRequest;
}

export async function createLeaveRequest(
  requestData: Omit<
    LeaveRequest,
    "id" | "serial_number" | "reviewed_by" | "reviewed_at" | "calendar_event_id" | "created_at" | "updated_at"
  > & { reviewed_by?: string | null; reviewed_at?: string | null },
): Promise<LeaveRequest> {
  // Generate serial number (e.g. "2026-0001")
  const year = new Date().getFullYear().toString();
  let serialNumber = `${year}-0001`;
  try {
    const { data: lastRow } = await supabase
      .from("leave_requests")
      .select("serial_number")
      .like("serial_number", `${year}-%`)
      .order("serial_number", { ascending: false })
      .limit(1);
    if (lastRow && lastRow.length > 0 && lastRow[0].serial_number) {
      const lastNum = parseInt(lastRow[0].serial_number.split("-")[1], 10);
      serialNumber = `${year}-${String(lastNum + 1).padStart(4, "0")}`;
    }
  } catch {
    // If serial_number column doesn't exist yet, skip
  }

  // Only include array fields when non-empty, so DB defaults are used
  // and inserts work before migrations add the columns.
  const { delegate_ids, delegate_assignments, chain_delegations, ...rest } = requestData;
  const insertPayload = {
    ...rest,
    serial_number: serialNumber,
    ...(delegate_ids?.length ? { delegate_ids } : {}),
    ...(delegate_assignments?.length ? { delegate_assignments } : {}),
    ...(chain_delegations?.length ? { chain_delegations } : {}),
  };

  const { data, error } = await supabase
    .from("leave_requests")
    .insert(insertPayload)
    .select("*")
    .single();

  if (error) throw error;
  return { delegate_ids: [], delegate_assignments: [], chain_delegations: [], serial_number: null, ...data } as LeaveRequest;
}

export async function updateLeaveRequest(
  id: string,
  updates: Partial<Omit<LeaveRequest, "id" | "created_at" | "updated_at">>,
): Promise<LeaveRequest> {
  const { data, error } = await supabase
    .from("leave_requests")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return { delegate_ids: [], delegate_assignments: [], chain_delegations: [], serial_number: null, ...data } as LeaveRequest;
}

export async function getApprovedDaysInPeriod(
  employeeId: string,
  leaveType: LeaveType,
  periodStart: string,
  periodEnd: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("leave_requests")
    .select("days")
    .eq("employee_id", employeeId)
    .eq("leave_type", leaveType)
    .eq("status", "approved")
    .gte("start_date", periodStart)
    .lte("start_date", periodEnd);

  if (error) throw error;

  return (data ?? []).reduce(
    (sum: number, row: { days: number }) => sum + row.days,
    0,
  );
}

// === Public Holidays ===

export async function getPublicHolidays(year?: number): Promise<PublicHoliday[]> {
  let query = supabase
    .from("public_holidays")
    .select("*")
    .order("date", { ascending: true });

  if (year) {
    query = query.eq("year", year);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as PublicHoliday[];
}

export async function getPublicHolidayDatesInRange(
  startDate: string,
  endDate: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("public_holidays")
    .select("date")
    .gte("date", startDate)
    .lte("date", endDate);

  if (error) throw error;
  return (data ?? []).map((row: { date: string }) => row.date);
}

export async function createPublicHoliday(
  holidayData: Omit<PublicHoliday, "id" | "created_at" | "updated_at">,
): Promise<PublicHoliday> {
  const { data, error } = await supabase
    .from("public_holidays")
    .insert(holidayData)
    .select("*")
    .single();

  if (error) throw error;
  return data as PublicHoliday;
}

export async function deletePublicHoliday(id: string): Promise<void> {
  const { error } = await supabase
    .from("public_holidays")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

export async function getOverlappingLeaveRequests(
  startDate: string,
  endDate: string,
): Promise<LeaveRequest[]> {
  const { data, error } = await supabase
    .from("leave_requests")
    .select("*")
    .in("status", ["approved", "pending"])
    .lte("start_date", endDate)
    .gte("end_date", startDate)
    .order("start_date", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    delegate_ids: [],
    delegate_assignments: [],
    serial_number: null,
    ...r,
  })) as unknown as LeaveRequest[];
}

// === Active Delegate Duties ===

export async function getActiveDelegateDuties(
  employeeId: string,
  startDate: string,
  endDate: string,
): Promise<LeaveRequest[]> {
  const { data, error } = await supabase
    .from("leave_requests")
    .select("*")
    .eq("status", "approved")
    .contains("delegate_ids", [employeeId])
    .lte("start_date", endDate)
    .gte("end_date", startDate);

  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    delegate_ids: [],
    delegate_assignments: [],
    chain_delegations: [],
    serial_number: null,
    ...r,
  })) as unknown as LeaveRequest[];
}

// === Delegated Leaves ===

export async function getDelegatedLeaves(
  delegateId: string,
): Promise<LeaveRequest[]> {
  // Try delegate_ids array first, fall back to legacy delegate_id column
  const { data, error } = await supabase
    .from("leave_requests")
    .select("*")
    .contains("delegate_ids", [delegateId])
    .eq("status", "approved")
    .gte("end_date", new Date().toISOString().split("T")[0])
    .order("start_date", { ascending: true });

  if (error) {
    // Fallback: delegate_ids column may not exist yet
    const { data: fallbackData, error: fallbackError } = await supabase
      .from("leave_requests")
      .select("*")
      .eq("delegate_id", delegateId)
      .eq("status", "approved")
      .gte("end_date", new Date().toISOString().split("T")[0])
      .order("start_date", { ascending: true });

    if (fallbackError) throw fallbackError;
    return (fallbackData ?? []).map((r: Record<string, unknown>) => ({
      delegate_ids: [],
      delegate_assignments: [],
      chain_delegations: [],
      serial_number: null,
      ...r,
    })) as unknown as LeaveRequest[];
  }

  return (data ?? []).map((r: Record<string, unknown>) => ({
    delegate_ids: [],
    delegate_assignments: [],
    serial_number: null,
    ...r,
  })) as unknown as LeaveRequest[];
}

// === Audit Log ===

export async function insertAuditLog(
  logData: Omit<AuditLog, "id" | "timestamp">,
): Promise<void> {
  const { error } = await supabase.from("audit_log").insert(logData);

  if (error) throw error;
}
