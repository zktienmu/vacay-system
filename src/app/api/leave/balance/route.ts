import { NextRequest, NextResponse } from "next/server";
import { SessionData, LeaveType } from "@/types";
import { withAuth } from "@/lib/auth/middleware";
import { getLeaveBalance } from "@/lib/leave/balance";
import { getEmployeeById } from "@/lib/supabase/queries";

const ALL_LEAVE_TYPES: LeaveType[] = [
  "annual",
  "personal",
  "sick",
  "official",
  "unpaid",
  "remote",
];

export const GET = withAuth(
  async (
    req: NextRequest,
    _ctx: { params: Promise<Record<string, string>> },
    session: SessionData,
  ) => {
    try {
      const { searchParams } = new URL(req.url);
      const targetEmployeeId =
        session.role === "admin"
          ? searchParams.get("employee_id") ?? session.employee_id
          : session.employee_id;

      const employee = await getEmployeeById(targetEmployeeId);
      if (!employee) {
        return NextResponse.json(
          { success: false, error: "Employee not found" },
          { status: 404 },
        );
      }

      const balances = await Promise.all(
        ALL_LEAVE_TYPES.map((type) =>
          getLeaveBalance(targetEmployeeId, type, employee.start_date),
        ),
      );

      return NextResponse.json({ success: true, data: balances });
    } catch {
      return NextResponse.json(
        { success: false, error: "Failed to fetch leave balances" },
        { status: 500 },
      );
    }
  },
);
