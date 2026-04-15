// Allow up to 30s for Slack + Google Calendar integrations
export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { SessionData } from "@/types";
import { withAuth } from "@/lib/auth/middleware";
import { getLeaveRequestById, insertAuditLog } from "@/lib/supabase/queries";
import { getClientIp } from "@/lib/security/rate-limit";
import { onLeaveRequestCancelled } from "@/lib/integrations/hooks";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Admin-only one-off: re-fire the cancellation integration (Slack channel post,
 * employee/delegate DMs, Google Calendar deletion) for a leave request that is
 * already in `cancelled` status but whose side effects didn't run.
 *
 * Created to clean up requests cancelled before the await fix landed
 * (2026-04-15 — fire-and-forget on Vercel serverless was getting killed
 * before integrations completed). Safe to keep around as an admin tool for
 * future Slack/Calendar outages.
 */
export const POST = withAuth(
  async (
    req: NextRequest,
    ctx: { params: Promise<Record<string, string>> },
    session: SessionData,
  ) => {
    if (session.role !== "admin") {
      return NextResponse.json(
        { success: false, error: "Forbidden — admin only" },
        { status: 403 },
      );
    }

    const { id } = await ctx.params;
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json(
        { success: false, error: "Invalid request ID" },
        { status: 400 },
      );
    }

    const leaveRequest = await getLeaveRequestById(id);
    if (!leaveRequest) {
      return NextResponse.json(
        { success: false, error: "Leave request not found" },
        { status: 404 },
      );
    }

    if (leaveRequest.status !== "cancelled") {
      return NextResponse.json(
        {
          success: false,
          error: `Leave is in status "${leaveRequest.status}", expected "cancelled"`,
        },
        { status: 400 },
      );
    }

    try {
      await onLeaveRequestCancelled(leaveRequest);
    } catch (err) {
      console.error("[ReplayCancel] Integration failed:", err);
      return NextResponse.json(
        { success: false, error: "Integration replay failed — check server logs" },
        { status: 500 },
      );
    }

    await insertAuditLog({
      actor_id: session.employee_id,
      action: "leave.cancel.replay",
      resource_type: "leave_request",
      resource_id: id,
      details: {
        employee_id: leaveRequest.employee_id,
        leave_type: leaveRequest.leave_type,
        had_calendar_event: Boolean(leaveRequest.calendar_event_id),
      },
      ip_address: getClientIp(req),
    }).catch((err) => console.error("[AuditLog] Failed:", err));

    return NextResponse.json({
      success: true,
      data: {
        replayed_for: id,
        employee_id: leaveRequest.employee_id,
        leave_type: leaveRequest.leave_type,
        dates: `${leaveRequest.start_date} ~ ${leaveRequest.end_date}`,
        calendar_event_deleted: Boolean(leaveRequest.calendar_event_id),
      },
    });
  },
);
