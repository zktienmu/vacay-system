import "server-only";
import * as Sentry from "@sentry/nextjs";
import { supabase } from "@/lib/supabase/client";
import { notifyNewRequest, notifyApproved, notifyRejected, notifyCancelled, notifyDelegate } from "@/lib/slack/notify";
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
    Sentry.captureException(error, {
      extra: { employeeId, context: "fetchEmployee" },
    });
    return null;
  }

  return data as Employee;
}

/**
 * Fetch all admin employees and managers from the database.
 * These are the people who can approve leave requests.
 */
async function fetchApprovers(): Promise<Employee[]> {
  const { data, error } = await supabase
    .from("employees")
    .select("*")
    .or("role.eq.admin,is_manager.eq.true");

  if (error) {
    console.error("[Integrations] Failed to fetch approvers", error);
    Sentry.captureException(error, {
      extra: { context: "fetchApprovers" },
    });
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

  const approvers = await fetchApprovers();
  await notifyNewRequest(request, employee, approvers);
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

  // Resolve delegates
  const delegateIds = request.delegate_ids?.length
    ? request.delegate_ids
    : request.delegate_id
      ? [request.delegate_id]
      : [];
  const delegates: Employee[] = [];
  for (const did of delegateIds) {
    const delegate = await fetchEmployee(did);
    if (delegate) delegates.push(delegate);
  }

  // Send Slack notifications with delegate names
  const delegateNames = delegates.map((d) => d.name);
  await notifyApproved(request, employee, delegateNames);

  // Notify each delegate via DM
  for (const delegate of delegates) {
    await notifyDelegate(request, employee, delegate);
  }

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
      Sentry.captureException(error, {
        extra: { requestId: request.id, context: "updateCalendarEventId" },
      });
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
  // Notify on Slack channel
  const employee = await fetchEmployee(request.employee_id);
  if (employee) {
    await notifyCancelled(request, employee);
  }

  // Clean up calendar event
  if (request.calendar_event_id) {
    await deleteLeaveEvent(request.calendar_event_id);
  }
}
