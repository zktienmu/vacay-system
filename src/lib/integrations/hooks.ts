import "server-only";
import { supabase } from "@/lib/supabase/client";
import { notifyNewRequest, notifyApproved, notifyRejected } from "@/lib/slack/notify";
import { createLeaveEvent, deleteLeaveEvent } from "@/lib/google/calendar";
import type { LeaveRequest, Employee } from "@/types";

/**
 * Fetch a single employee by ID from the database.
 * Returns null if not found.
 */
async function fetchEmployee(employeeId: string): Promise<Employee | null> {
  const { data, error } = await supabase
    .from("employees")
    .select("*")
    .eq("id", employeeId)
    .single();

  if (error) {
    console.error("[Integrations] Failed to fetch employee", employeeId, error);
    return null;
  }

  return data as Employee;
}

/**
 * Fetch all admin employees from the database.
 */
async function fetchAdmins(): Promise<Employee[]> {
  const { data, error } = await supabase
    .from("employees")
    .select("*")
    .eq("role", "admin");

  if (error) {
    console.error("[Integrations] Failed to fetch admins", error);
    return [];
  }

  return (data ?? []) as Employee[];
}

/**
 * Called when a new leave request is created.
 * Notifies all admin users via Slack DM.
 */
export async function onLeaveRequestCreated(
  request: LeaveRequest,
): Promise<void> {
  const employee = await fetchEmployee(request.employee_id);
  if (!employee) {
    console.error(
      "[Integrations] Cannot notify: employee not found",
      request.employee_id,
    );
    return;
  }

  const admins = await fetchAdmins();
  await notifyNewRequest(request, employee, admins);
}

/**
 * Called when a leave request is approved.
 * Sends Slack notification and creates a Google Calendar event.
 */
export async function onLeaveRequestApproved(
  request: LeaveRequest,
): Promise<void> {
  const employee = await fetchEmployee(request.employee_id);
  if (!employee) {
    console.error(
      "[Integrations] Cannot notify: employee not found",
      request.employee_id,
    );
    return;
  }

  // Send Slack notifications (fire-and-forget)
  await notifyApproved(request, employee);

  // Create Google Calendar event
  const eventId = await createLeaveEvent(request, employee.name);

  // Update the leave request with the calendar event ID
  if (eventId) {
    const { error } = await supabase
      .from("leave_requests")
      .update({ calendar_event_id: eventId })
      .eq("id", request.id);

    if (error) {
      console.error(
        "[Integrations] Failed to update calendar_event_id",
        request.id,
        error,
      );
    }
  }
}

/**
 * Called when a leave request is rejected.
 * Sends Slack notification and cleans up any calendar event.
 */
export async function onLeaveRequestRejected(
  request: LeaveRequest,
): Promise<void> {
  const employee = await fetchEmployee(request.employee_id);
  if (!employee) {
    console.error(
      "[Integrations] Cannot notify: employee not found",
      request.employee_id,
    );
    return;
  }

  // Send Slack rejection notification
  await notifyRejected(request, employee);

  // Clean up calendar event if one was created
  if (request.calendar_event_id) {
    await deleteLeaveEvent(request.calendar_event_id);
  }
}

/**
 * Called when a leave request is cancelled.
 * Cleans up the calendar event if one exists.
 */
export async function onLeaveRequestCancelled(
  request: LeaveRequest,
): Promise<void> {
  if (request.calendar_event_id) {
    await deleteLeaveEvent(request.calendar_event_id);
  }
}
