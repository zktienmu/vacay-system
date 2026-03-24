import "server-only";
import { supabase } from "@/lib/supabase/client";
import { notifyNewRequest, notifyApproved, notifyRejected, notifyCancelled, notifyDelegate, notifyChainDelegation } from "@/lib/slack/notify";
import { createLeaveEvent, deleteLeaveEvent } from "@/lib/google/calendar";
import { createHandoverTask, deleteAsanaTask } from "@/lib/asana/tasks";
import type { LeaveRequest, Employee, DelegateAssignment, ChainDelegation } from "@/types";
import type { ResolvedDelegateAssignment } from "@/lib/slack/format";

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

  // Build per-delegate assignment map for quick lookup
  const assignments = request.delegate_assignments ?? [];
  const assignmentByDelegateId = new Map<string, DelegateAssignment>(
    assignments.map((a) => [a.delegate_id, a]),
  );

  // Build resolved assignments (with names) for the channel post
  const resolvedAssignments: ResolvedDelegateAssignment[] = [];
  for (const d of delegates) {
    const a = assignmentByDelegateId.get(d.id);
    if (a && a.dates.length > 0) {
      resolvedAssignments.push({ name: d.name, dates: a.dates, handover_note: a.handover_note });
    }
  }

  // Send Slack notifications with delegate names + assignment details
  const delegateNames = delegates.map((d) => d.name);
  await notifyApproved(
    request,
    employee,
    delegateNames,
    resolvedAssignments.length > 0 ? resolvedAssignments : undefined,
  );

  // Notify each delegate via DM with their specific assignment
  for (const delegate of delegates) {
    const assignment = assignmentByDelegateId.get(delegate.id);
    await notifyDelegate(
      request,
      employee,
      delegate,
      assignment && assignment.dates.length > 0
        ? { dates: assignment.dates, handover_note: assignment.handover_note }
        : undefined,
    );
  }

  // Chain delegation: notify the designated person about inherited duties.
  // If chain_delegations is populated (new flow), use targeted notification.
  // Otherwise, fall back to legacy broadcast to all delegates.
  try {
    const chainDelegations: ChainDelegation[] = request.chain_delegations ?? [];
    const { formatDateRange } = await import("@/lib/slack/format");
    const leaveDateRange = formatDateRange(request.start_date, request.end_date);

    if (chainDelegations.length > 0) {
      // Targeted notification: only notify the explicitly chosen delegate per duty
      for (const cd of chainDelegations) {
        const reassigned = await fetchEmployee(cd.reassigned_to);
        if (!reassigned?.slack_user_id) continue;

        const originalName = (await fetchEmployee(cd.original_employee_id))?.name ?? "Unknown";
        await notifyChainDelegation(
          reassigned.slack_user_id,
          employee.name,
          originalName,
          leaveDateRange,
          cd.handover_note,
        );
      }
    } else {
      // Legacy fallback: broadcast to all delegates for requests without chain_delegations
      const { data: affectedLeaves } = await supabase
        .from("leave_requests")
        .select("*")
        .eq("status", "approved")
        .contains("delegate_ids", [request.employee_id])
        .lte("start_date", request.end_date)
        .gte("end_date", request.start_date);

      if (affectedLeaves && affectedLeaves.length > 0) {
        for (const affected of affectedLeaves) {
          const affectedAssignments: DelegateAssignment[] = affected.delegate_assignments ?? [];
          const inheritedAssignment = affectedAssignments.find(
            (a: DelegateAssignment) => a.delegate_id === request.employee_id,
          );
          if (!inheritedAssignment) continue;

          const originalRequester = await fetchEmployee(affected.employee_id);
          const originalName = originalRequester?.name ?? "Unknown";

          for (const delegate of delegates) {
            if (!delegate.slack_user_id) continue;
            await notifyChainDelegation(
              delegate.slack_user_id,
              employee.name,
              originalName,
              leaveDateRange,
              inheritedAssignment.handover_note,
            );
          }
        }
      }
    }
  } catch (err) {
    console.error("[Integrations] Chain delegation check failed", err);
  }

  // Create Asana handover tasks for each delegate
  try {
    const asanaTaskIds: string[] = [];
    for (const delegate of delegates) {
      if (!delegate.asana_user_gid) continue;
      const assignment = assignmentByDelegateId.get(delegate.id);
      const taskGid = await createHandoverTask({
        assigneeGid: delegate.asana_user_gid,
        employeeName: employee.name,
        handoverNote: assignment?.handover_note ?? null,
        delegateName: delegate.name,
        startDate: request.start_date,
        endDate: request.end_date,
      });
      if (taskGid) asanaTaskIds.push(taskGid);
    }

    // Also create tasks for chain delegation reassigned delegates
    const chainDelegations: ChainDelegation[] = request.chain_delegations ?? [];
    for (const cd of chainDelegations) {
      const reassigned = await fetchEmployee(cd.reassigned_to);
      if (!reassigned?.asana_user_gid) continue;
      const originalName = (await fetchEmployee(cd.original_employee_id))?.name ?? "Unknown";
      const taskGid = await createHandoverTask({
        assigneeGid: reassigned.asana_user_gid,
        employeeName: originalName,
        handoverNote: cd.handover_note,
        delegateName: reassigned.name,
        startDate: cd.dates[0] ?? request.start_date,
        endDate: cd.dates[cd.dates.length - 1] ?? request.end_date,
      });
      if (taskGid) asanaTaskIds.push(taskGid);
    }

    // Persist Asana task IDs
    if (asanaTaskIds.length > 0) {
      const { error } = await supabase
        .from("leave_requests")
        .update({ asana_task_ids: asanaTaskIds })
        .eq("id", request.id);

      if (error) {
        console.error("[Integrations] Failed to update asana_task_ids", request.id, error);
      }
    }
  } catch (err) {
    console.error("[Integrations] Asana task creation failed", err);
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

  // Clean up Asana tasks
  for (const taskGid of request.asana_task_ids ?? []) {
    await deleteAsanaTask(taskGid);
  }
}

/**
 * Called when a leave request is cancelled.
 * Cleans up the calendar event and Asana tasks if any exist.
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

  // Clean up Asana tasks
  for (const taskGid of request.asana_task_ids ?? []) {
    await deleteAsanaTask(taskGid);
  }
}
