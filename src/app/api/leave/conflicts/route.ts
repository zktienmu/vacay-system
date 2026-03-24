import { NextRequest, NextResponse } from "next/server";
import { SessionData } from "@/types";
import { withAuth } from "@/lib/auth/middleware";
import { getOverlappingLeaveRequests } from "@/lib/supabase/queries";

export const GET = withAuth(
  async (
    req: NextRequest,
    _ctx: { params: Promise<Record<string, string>> },
    _session: SessionData,
  ) => {
    try {
      const { searchParams } = new URL(req.url);
      const startDate = searchParams.get("start_date");
      const endDate = searchParams.get("end_date");

      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!startDate || !endDate || !dateRegex.test(startDate) || !dateRegex.test(endDate)) {
        return NextResponse.json(
          { success: false, error: "start_date and end_date are required (YYYY-MM-DD)" },
          { status: 400 },
        );
      }

      if (new Date(endDate) < new Date(startDate)) {
        return NextResponse.json(
          { success: false, error: "end_date must be on or after start_date" },
          { status: 400 },
        );
      }

      const overlapping = await getOverlappingLeaveRequests(startDate, endDate);

      // For each leave request, expand the date range into individual working days
      // (exclude weekends) that fall within the requested range
      const conflicts: Record<string, string[]> = {};

      for (const leave of overlapping) {
        const leaveDays: string[] = [];
        const current = new Date(leave.start_date);
        const leaveEnd = new Date(leave.end_date);
        const rangeStart = new Date(startDate);
        const rangeEnd = new Date(endDate);

        while (current <= leaveEnd) {
          const dayOfWeek = current.getDay();
          // Skip weekends (0 = Sunday, 6 = Saturday)
          if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            // Only include days within the requested range
            if (current >= rangeStart && current <= rangeEnd) {
              leaveDays.push(current.toISOString().split("T")[0]);
            }
          }
          current.setDate(current.getDate() + 1);
        }

        if (leaveDays.length > 0) {
          if (!conflicts[leave.employee_id]) {
            conflicts[leave.employee_id] = [];
          }
          // Merge days, avoiding duplicates (in case of multiple leave requests)
          for (const day of leaveDays) {
            if (!conflicts[leave.employee_id].includes(day)) {
              conflicts[leave.employee_id].push(day);
            }
          }
        }
      }

      // Sort each employee's days
      for (const employeeId of Object.keys(conflicts)) {
        conflicts[employeeId].sort();
      }

      return NextResponse.json({ success: true, data: conflicts });
    } catch {
      return NextResponse.json(
        { success: false, error: "Failed to fetch leave conflicts" },
        { status: 500 },
      );
    }
  },
);
