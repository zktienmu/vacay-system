import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { SessionData } from "@/types";
import { withAuth } from "@/lib/auth/middleware";
import {
  updateLeaveStatusSchema,
  cancelLeaveSchema,
} from "@/lib/leave/validation";
import {
  getLeaveRequestById,
  updateLeaveRequest,
  insertAuditLog,
} from "@/lib/supabase/queries";
import { getClientIp } from "@/lib/security/rate-limit";
import {
  onLeaveRequestApproved,
  onLeaveRequestRejected,
  onLeaveRequestCancelled,
} from "@/lib/integrations/hooks";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const PATCH = withAuth(
  async (
    req: NextRequest,
    ctx: { params: Promise<Record<string, string>> },
    session: SessionData,
  ) => {
    try {
      const { id } = await ctx.params;

      if (!UUID_REGEX.test(id)) {
        return NextResponse.json(
          { success: false, error: "Invalid request ID" },
          { status: 400 },
        );
      }

      const body = await req.json();

      const leaveRequest = await getLeaveRequestById(id);
      if (!leaveRequest) {
        return NextResponse.json(
          { success: false, error: "Leave request not found" },
          { status: 404 },
        );
      }

      // Employee cancelling their own request
      if (body.status === "cancelled") {
        const parsed = cancelLeaveSchema.safeParse(body);
        if (!parsed.success) {
          return NextResponse.json(
            { success: false, error: "Invalid request body" },
            { status: 400 },
          );
        }

        if (leaveRequest.employee_id !== session.employee_id && session.role !== "admin") {
          return NextResponse.json(
            { success: false, error: "Forbidden" },
            { status: 403 },
          );
        }

        if (leaveRequest.status !== "pending" && leaveRequest.status !== "approved") {
          return NextResponse.json(
            {
              success: false,
              error: "Only pending or approved requests can be cancelled",
            },
            { status: 400 },
          );
        }

        const updated = await updateLeaveRequest(id, {
          status: "cancelled",
        });

        await insertAuditLog({
          actor_id: session.employee_id,
          action: "leave.cancel",
          resource_type: "leave_request",
          resource_id: id,
          details: { previous_status: leaveRequest.status },
          ip_address:
            getClientIp(req),
        }).catch((err) => console.error("[AuditLog] Failed:", err));

        // Fire-and-forget: clean up calendar event
        onLeaveRequestCancelled(leaveRequest).catch(() => {});

        return NextResponse.json({ success: true, data: updated });
      }

      // Admin or manager approving/rejecting
      if (session.role !== "admin" && !session.is_manager) {
        return NextResponse.json(
          { success: false, error: "Forbidden" },
          { status: 403 },
        );
      }

      // Any manager from any department can approve/reject leave requests

      const parsed = updateLeaveStatusSchema.safeParse(body);
      if (!parsed.success) {
        const firstError =
          parsed.error.issues[0]?.message ?? "Invalid request body";
        return NextResponse.json(
          { success: false, error: firstError },
          { status: 400 },
        );
      }

      if (leaveRequest.status !== "pending") {
        return NextResponse.json(
          {
            success: false,
            error: "Only pending requests can be approved or rejected",
          },
          { status: 400 },
        );
      }

      const updated = await updateLeaveRequest(id, {
        status: parsed.data.status,
        reviewed_by: session.employee_id,
        reviewed_at: new Date().toISOString(),
      });

      await insertAuditLog({
        actor_id: session.employee_id,
        action: `leave.${parsed.data.status}`,
        resource_type: "leave_request",
        resource_id: id,
        details: {
          employee_id: leaveRequest.employee_id,
          leave_type: leaveRequest.leave_type,
        },
        ip_address:
          getClientIp(req),
      }).catch((err) => console.error("[AuditLog] Failed:", err));

      // Fire-and-forget: Slack + Google Calendar integrations
      if (parsed.data.status === "approved") {
        onLeaveRequestApproved(updated).catch(() => {});
      } else if (parsed.data.status === "rejected") {
        onLeaveRequestRejected(updated).catch(() => {});
      }

      return NextResponse.json({ success: true, data: updated });
    } catch (error) {
      Sentry.captureException(error);
      return NextResponse.json(
        { success: false, error: "Failed to update leave request" },
        { status: 500 },
      );
    }
  },
);
