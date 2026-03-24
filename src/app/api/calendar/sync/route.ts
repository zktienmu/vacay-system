import { NextRequest, NextResponse } from "next/server";
import { SessionData } from "@/types";
import { withAdmin } from "@/lib/auth/middleware";
import { getLeaveRequestById, getEmployeeById, updateLeaveRequest } from "@/lib/supabase/queries";
import { createLeaveEvent, deleteLeaveEvent } from "@/lib/google/calendar";
import { onLeaveRequestApproved } from "@/lib/integrations/hooks";

export const POST = withAdmin(
  async (
    req: NextRequest,
    _ctx: { params: Promise<Record<string, string>> },
    _session: SessionData,
  ) => {
    try {
      const body = await req.json();
      const { leave_request_id, slack_only } = body;

      if (!leave_request_id || typeof leave_request_id !== "string") {
        return NextResponse.json(
          { success: false, error: "leave_request_id is required" },
          { status: 400 },
        );
      }

      const request = await getLeaveRequestById(leave_request_id);
      if (!request) {
        return NextResponse.json(
          { success: false, error: "Leave request not found" },
          { status: 404 },
        );
      }

      if (request.status !== "approved") {
        return NextResponse.json(
          { success: false, error: "Only approved leave requests can be synced" },
          { status: 400 },
        );
      }

      if (slack_only) {
        // Re-trigger all Slack notifications (delegate DMs, channel post, etc.)
        await onLeaveRequestApproved(request);
        return NextResponse.json({ success: true, data: { synced: "slack" } });
      }

      // Full sync: Google Calendar + Slack
      const employee = await getEmployeeById(request.employee_id);
      if (!employee) {
        return NextResponse.json(
          { success: false, error: "Employee not found" },
          { status: 404 },
        );
      }

      // Delete existing calendar events if any
      if (request.calendar_event_id) {
        await deleteLeaveEvent(request.calendar_event_id);
      }

      // Create new calendar events
      const eventId = await createLeaveEvent(request, employee.name);

      if (eventId) {
        await updateLeaveRequest(leave_request_id, {
          calendar_event_id: eventId,
        });
      }

      // Also re-trigger Slack notifications
      await onLeaveRequestApproved(request);

      return NextResponse.json({
        success: true,
        data: { calendar_event_id: eventId, synced: "all" },
      });
    } catch (err) {
      console.error("[Calendar Sync] Failed:", err);
      return NextResponse.json(
        { success: false, error: "Failed to sync" },
        { status: 500 },
      );
    }
  },
);
