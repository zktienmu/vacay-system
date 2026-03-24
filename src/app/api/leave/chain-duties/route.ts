import { NextRequest, NextResponse } from "next/server";
import { SessionData, DelegateAssignment } from "@/types";
import { withAuth } from "@/lib/auth/middleware";
import { getActiveDelegateDuties, getEmployeeById } from "@/lib/supabase/queries";

export const GET = withAuth(
  async (
    req: NextRequest,
    _ctx: { params: Promise<Record<string, string>> },
    session: SessionData,
  ) => {
    try {
      const { searchParams } = new URL(req.url);
      const startDate = searchParams.get("start_date");
      const endDate = searchParams.get("end_date");

      if (!startDate || !endDate) {
        return NextResponse.json(
          { success: false, error: "start_date and end_date are required" },
          { status: 400 },
        );
      }

      const duties = await getActiveDelegateDuties(
        session.employee_id,
        startDate,
        endDate,
      );

      const data = await Promise.all(
        duties.map(async (leave) => {
          const employee = await getEmployeeById(leave.employee_id);
          const assignments: DelegateAssignment[] = leave.delegate_assignments ?? [];
          const myAssignment = assignments.find(
            (a) => a.delegate_id === session.employee_id,
          );

          // Compute overlapping dates: intersection of my assigned dates and the requested range
          const overlappingDates = myAssignment
            ? myAssignment.dates.filter(
                (d) => d >= startDate && d <= endDate,
              )
            : [];

          return {
            original_leave_id: leave.id,
            original_employee_id: leave.employee_id,
            original_employee_name: employee?.name ?? "Unknown",
            overlapping_dates: overlappingDates,
            handover_note: myAssignment?.handover_note ?? null,
          };
        }),
      );

      // Only return duties with actual overlapping dates
      const filtered = data.filter((d) => d.overlapping_dates.length > 0);

      return NextResponse.json({ success: true, data: filtered });
    } catch {
      return NextResponse.json(
        { success: false, error: "Failed to fetch chain duties" },
        { status: 500 },
      );
    }
  },
);
