import { NextRequest, NextResponse } from "next/server";
import { SessionData } from "@/types";
import { withAuth } from "@/lib/auth/middleware";
import { createLeaveRequestSchema } from "@/lib/leave/validation";
import { calculateWorkingDaysExcludingHolidays, getLeaveBalance } from "@/lib/leave/balance";
import {
  getLeaveRequests,
  createLeaveRequest,
  getEmployeeById,
  insertAuditLog,
} from "@/lib/supabase/queries";
import { onLeaveRequestCreated } from "@/lib/integrations/hooks";

export const GET = withAuth(
  async (
    req: NextRequest,
    _ctx: { params: Promise<Record<string, string>> },
    session: SessionData,
  ) => {
    try {
      const { searchParams } = new URL(req.url);
      const showAll = searchParams.get("all") === "true";
      const statusParam = searchParams.get("status");
      const validStatuses = ["pending", "approved", "rejected", "cancelled"];

      const filters: {
        employee_id?: string;
        status?: "pending" | "approved" | "rejected" | "cancelled";
        start_date?: string;
        end_date?: string;
      } = {};

      // Only admins can view all requests
      if (!(showAll && session.role === "admin")) {
        filters.employee_id = session.employee_id;
      }

      if (statusParam && validStatuses.includes(statusParam)) {
        filters.status = statusParam as "pending" | "approved" | "rejected" | "cancelled";
      }

      const startDate = searchParams.get("start_date");
      const endDate = searchParams.get("end_date");
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (startDate && dateRegex.test(startDate)) filters.start_date = startDate;
      if (endDate && dateRegex.test(endDate)) filters.end_date = endDate;

      const requests = await getLeaveRequests(filters);
      return NextResponse.json({ success: true, data: requests });
    } catch {
      return NextResponse.json(
        { success: false, error: "Failed to fetch leave requests" },
        { status: 500 },
      );
    }
  },
);

export const POST = withAuth(
  async (
    req: NextRequest,
    _ctx: { params: Promise<Record<string, string>> },
    session: SessionData,
  ) => {
    try {
      const body = await req.json();
      const parsed = createLeaveRequestSchema.safeParse(body);

      if (!parsed.success) {
        const firstError =
          parsed.error.issues[0]?.message ?? "Invalid request body";
        return NextResponse.json(
          { success: false, error: firstError },
          { status: 400 },
        );
      }

      const { leave_type, start_date, end_date, delegate_id, notes } =
        parsed.data;

      // Validate that start date is not in the past
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (new Date(start_date) < today) {
        return NextResponse.json(
          { success: false, error: "Start date cannot be in the past" },
          { status: 400 },
        );
      }

      const days = await calculateWorkingDaysExcludingHolidays(start_date, end_date);

      if (days === 0) {
        return NextResponse.json(
          {
            success: false,
            error: "No working days in the selected range",
          },
          { status: 400 },
        );
      }

      // Check balance (skip for unpaid/official leave)
      if (leave_type !== "unpaid" && leave_type !== "official") {
        const employee = await getEmployeeById(session.employee_id);
        if (!employee) {
          return NextResponse.json(
            { success: false, error: "Employee not found" },
            { status: 404 },
          );
        }

        const balance = await getLeaveBalance(
          session.employee_id,
          leave_type,
          employee.start_date,
        );

        if (days > balance.remaining_days) {
          return NextResponse.json(
            {
              success: false,
              error: `Insufficient ${leave_type} leave balance. Remaining: ${balance.remaining_days} days, Requested: ${days} days`,
            },
            { status: 400 },
          );
        }
      }

      // Validate delegate exists if provided
      if (delegate_id) {
        const delegate = await getEmployeeById(delegate_id);
        if (!delegate) {
          return NextResponse.json(
            { success: false, error: "Delegate not found" },
            { status: 400 },
          );
        }
      }

      const leaveRequest = await createLeaveRequest({
        employee_id: session.employee_id,
        leave_type,
        start_date,
        end_date,
        days,
        delegate_id: delegate_id ?? null,
        notes: notes ?? null,
        status: "pending",
      });

      await insertAuditLog({
        actor_id: session.employee_id,
        action: "leave.create",
        resource_type: "leave_request",
        resource_id: leaveRequest.id,
        details: { leave_type, start_date, end_date, days },
        ip_address:
          req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      }).catch((err) => console.error("[AuditLog] Failed:", err));

      // Fire-and-forget: notify admins via Slack
      onLeaveRequestCreated(leaveRequest).catch(() => {});

      return NextResponse.json(
        { success: true, data: leaveRequest },
        { status: 201 },
      );
    } catch {
      return NextResponse.json(
        { success: false, error: "Failed to create leave request" },
        { status: 500 },
      );
    }
  },
);
