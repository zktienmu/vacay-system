import { NextRequest, NextResponse } from "next/server";
import { SessionData } from "@/types";
import { withAuth } from "@/lib/auth/middleware";
import { createLeaveRequestSchema } from "@/lib/leave/validation";
import { calculateWorkingDaysExcludingHolidays, getLeaveBalance } from "@/lib/leave/balance";
import {
  getLeaveRequests,
  createLeaveRequest,
  getEmployeeById,
  getEmployeesByIds,
  insertAuditLog,
} from "@/lib/supabase/queries";
import { getClientIp } from "@/lib/security/rate-limit";
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

      // Admins and managers can view all requests
      if (showAll && (session.role === "admin" || session.is_manager)) {
        // Allow admin to filter by specific employee
        const employeeIdParam = searchParams.get("employee_id");
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (session.role === "admin" && employeeIdParam && uuidRegex.test(employeeIdParam)) {
          filters.employee_id = employeeIdParam;
        }
      } else {
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

      // Enrich with reviewer info
      const reviewerIds = [
        ...new Set(
          requests
            .map((r) => r.reviewed_by)
            .filter((id): id is string => id != null),
        ),
      ];
      const reviewers = await getEmployeesByIds(reviewerIds);
      const reviewerMap = new Map(reviewers.map((e) => [e.id, e]));

      const enriched = requests.map((r) => ({
        ...r,
        reviewer: r.reviewed_by ? reviewerMap.get(r.reviewed_by) ?? null : null,
      }));

      return NextResponse.json({ success: true, data: enriched });
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

      const { leave_type, start_date, end_date, delegate_id, delegate_ids, delegate_assignments, chain_delegations, handover_url, notes, for_employee_id } =
        parsed.data;

      // Admin backfill: create leave on behalf of an employee
      const isAdminBackfill = !!for_employee_id;
      if (isAdminBackfill && session.role !== "admin") {
        return NextResponse.json(
          { success: false, error: "Only admins can create leave on behalf of employees" },
          { status: 403 },
        );
      }

      const targetEmployeeId = isAdminBackfill ? for_employee_id : session.employee_id;

      // Validate that start date is not in the past (skip for admin backfill)
      if (!isAdminBackfill) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (new Date(start_date) < today) {
          return NextResponse.json(
            { success: false, error: "Start date cannot be in the past" },
            { status: 400 },
          );
        }
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

      // Require handover URL for leaves >= 3 working days (skip for admin backfill)
      if (!isAdminBackfill && days >= 3 && (!handover_url || handover_url.trim() === "")) {
        return NextResponse.json(
          {
            success: false,
            error: "Handover document URL is required for leaves of 3+ working days",
          },
          { status: 400 },
        );
      }

      // Check balance (skip for unpaid/official leave and admin backfill)
      if (!isAdminBackfill && leave_type !== "unpaid" && leave_type !== "official") {
        const employee = await getEmployeeById(targetEmployeeId);
        if (!employee) {
          return NextResponse.json(
            { success: false, error: "Employee not found" },
            { status: 404 },
          );
        }

        const balance = await getLeaveBalance(
          targetEmployeeId,
          leave_type,
          employee.start_date,
          employee.transition_annual_days,
        );

        // Total remaining includes transition + formal
        const transitionRemaining =
          balance.transition_days != null && balance.transition_used_days != null
            ? balance.transition_days - balance.transition_used_days
            : 0;
        const totalRemaining = balance.remaining_days + transitionRemaining;

        if (days > totalRemaining) {
          return NextResponse.json(
            {
              success: false,
              error: `Insufficient ${leave_type} leave balance. Remaining: ${totalRemaining} days, Requested: ${days} days`,
            },
            { status: 400 },
          );
        }
      }

      // Use delegate_ids if provided, fall back to legacy delegate_id
      const resolvedDelegateIds =
        delegate_ids.length > 0
          ? delegate_ids
          : delegate_id
            ? [delegate_id]
            : [];

      // Non-backfill requests require at least one delegate
      if (!isAdminBackfill && resolvedDelegateIds.length === 0) {
        return NextResponse.json(
          { success: false, error: "At least one delegate is required" },
          { status: 400 },
        );
      }

      // Validate each delegate exists and is not the requester
      for (const did of resolvedDelegateIds) {
        if (did === targetEmployeeId) {
          return NextResponse.json(
            { success: false, error: "Cannot delegate to yourself" },
            { status: 400 },
          );
        }
        const delegate = await getEmployeeById(did);
        if (!delegate) {
          return NextResponse.json(
            { success: false, error: `Delegate not found: ${did}` },
            { status: 400 },
          );
        }
      }

      // Validate chain_delegations: each reassigned_to must be in delegate_ids
      const resolvedChainDelegations = chain_delegations ?? [];
      for (const cd of resolvedChainDelegations) {
        if (!resolvedDelegateIds.includes(cd.reassigned_to)) {
          return NextResponse.json(
            { success: false, error: "Chain delegation reassigned_to must be one of the selected delegates" },
            { status: 400 },
          );
        }
      }

      const leaveRequest = await createLeaveRequest({
        employee_id: targetEmployeeId,
        leave_type,
        start_date,
        end_date,
        days,
        delegate_id: resolvedDelegateIds[0] ?? null,
        delegate_ids: resolvedDelegateIds,
        delegate_assignments: delegate_assignments ?? [],
        chain_delegations: resolvedChainDelegations,
        handover_url: handover_url ?? null,
        notes: notes ?? null,
        status: isAdminBackfill ? "approved" : "pending",
        ...(isAdminBackfill && {
          reviewed_by: session.employee_id,
          reviewed_at: new Date().toISOString(),
        }),
      });

      await insertAuditLog({
        actor_id: session.employee_id,
        action: isAdminBackfill ? "leave.backfill" : "leave.create",
        resource_type: "leave_request",
        resource_id: leaveRequest.id,
        details: {
          leave_type, start_date, end_date, days,
          ...(isAdminBackfill && { created_for: targetEmployeeId }),
        },
        ip_address: getClientIp(req),
      }).catch((err) => console.error("[AuditLog] Failed:", err));

      // Fire-and-forget: notify admins via Slack (skip for backfill)
      if (!isAdminBackfill) {
        onLeaveRequestCreated(leaveRequest).catch(() => {});
      }

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
