import { NextRequest, NextResponse } from "next/server";
import { SessionData } from "@/types";
import { withAdmin } from "@/lib/auth/middleware";
import { getLeaveRequestById, getEmployeeById, updateLeaveRequest } from "@/lib/supabase/queries";
import { createLeaveEvent, deleteLeaveEvent } from "@/lib/google/calendar";

export const POST = withAdmin(
  async (
    req: NextRequest,
    _ctx: { params: Promise<Record<string, string>> },
    _session: SessionData,
  ) => {
    try {
      const body = await req.json();
      const { leave_request_id } = body;

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
          { success: false, error: "Only approved leave requests can be synced to calendar" },
          { status: 400 },
        );
      }

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

      return NextResponse.json({
        success: true,
        data: { calendar_event_id: eventId },
      });
    } catch {
      return NextResponse.json(
        { success: false, error: "Failed to sync calendar event" },
        { status: 500 },
      );
    }
  },
);
