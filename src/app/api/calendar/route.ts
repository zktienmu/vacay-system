import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { startOfMonth, endOfMonth, addDays, parseISO, format } from "date-fns";
import { supabase } from "@/lib/supabase/client";
import { sessionOptions } from "@/lib/auth/session";
import { formatLeaveType } from "@/lib/slack/format";
import { getLeaveTypeEmoji } from "@/lib/google/calendar";
import type { SessionData, LeaveType, ApiResponse } from "@/types";

const leaveTypeColors: Record<LeaveType, string> = {
  annual: "#3B82F6",
  personal: "#8B5CF6",
  sick: "#EF4444",
  remote: "#22C55E",
  family_care: "#F59E0B",
  menstrual: "#EC4899",
};

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  color: string;
  allDay: true;
}

export async function GET(
  req: NextRequest,
): Promise<NextResponse<ApiResponse<CalendarEvent[]>>> {
  try {
    // Inline auth check
    const session = await getIronSession<SessionData>(
      await cookies(),
      sessionOptions,
    );

    if (!session.employee_id) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    // Parse month parameter (YYYY-MM format), default to current month
    const searchParams = req.nextUrl.searchParams;
    const monthParam = searchParams.get("month");

    let monthStart: Date;
    let monthEnd: Date;

    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      // Parse YYYY-MM as the first day of that month
      monthStart = startOfMonth(parseISO(`${monthParam}-01`));
      monthEnd = endOfMonth(monthStart);
    } else {
      monthStart = startOfMonth(new Date());
      monthEnd = endOfMonth(new Date());
    }

    const monthStartStr = format(monthStart, "yyyy-MM-dd");
    const monthEndStr = format(monthEnd, "yyyy-MM-dd");

    // All signed-in employees see all approved leaves on the calendar.
    const { data: requests, error } = await supabase
      .from("leave_requests")
      .select(
        `
        id,
        employee_id,
        leave_type,
        start_date,
        end_date,
        days,
        status,
        employees!leave_requests_employee_id_fkey ( name, department )
      `,
      )
      .eq("status", "approved")
      .lte("start_date", monthEndStr)
      .gte("end_date", monthStartStr);

    if (error) {
      return NextResponse.json(
        { success: false, error: "Failed to fetch calendar events" },
        { status: 500 },
      );
    }

    const filteredRequests = requests ?? [];

    const events: CalendarEvent[] = filteredRequests.map((row) => {
      const leaveType = row.leave_type as LeaveType;
      // employees is the joined data — could be an object or array
      const employeeData = row.employees as
        | { name: string }
        | { name: string }[]
        | null;
      const employeeName = Array.isArray(employeeData)
        ? employeeData[0]?.name ?? "Unknown"
        : employeeData?.name ?? "Unknown";

      const emoji = getLeaveTypeEmoji(leaveType);
      const typeLabel = formatLeaveType(leaveType);

      // FullCalendar end date is exclusive, so add 1 day
      const endExclusive = format(
        addDays(parseISO(row.end_date as string), 1),
        "yyyy-MM-dd",
      );

      return {
        id: row.id as string,
        title: `${emoji} ${employeeName} - ${typeLabel}`,
        start: row.start_date as string,
        end: endExclusive,
        color: leaveTypeColors[leaveType] ?? "#6B7280",
        allDay: true as const,
      };
    });

    return NextResponse.json({ success: true, data: events });
  } catch {
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
