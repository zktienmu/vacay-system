import { NextRequest, NextResponse } from "next/server";
import { SessionData } from "@/types";
import { withAdmin } from "@/lib/auth/middleware";
import { upsertPolicySchema } from "@/lib/leave/validation";
import {
  getEmployeeById,
  getLeavePolicies,
  upsertLeavePolicy,
  insertAuditLog,
} from "@/lib/supabase/queries";

export const GET = withAdmin(
  async (
    _req: NextRequest,
    ctx: { params: Promise<Record<string, string>> },
    _session: SessionData,
  ) => {
    try {
      const { id } = await ctx.params;

      const employee = await getEmployeeById(id);
      if (!employee) {
        return NextResponse.json(
          { success: false, error: "Employee not found" },
          { status: 404 },
        );
      }

      const policies = await getLeavePolicies(id);
      return NextResponse.json({ success: true, data: policies });
    } catch {
      return NextResponse.json(
        { success: false, error: "Failed to fetch policies" },
        { status: 500 },
      );
    }
  },
);

export const PUT = withAdmin(
  async (
    req: NextRequest,
    ctx: { params: Promise<Record<string, string>> },
    session: SessionData,
  ) => {
    try {
      const { id } = await ctx.params;
      const body = await req.json();
      const parsed = upsertPolicySchema.safeParse(body);

      if (!parsed.success) {
        const firstError =
          parsed.error.issues[0]?.message ?? "Invalid request body";
        return NextResponse.json(
          { success: false, error: firstError },
          { status: 400 },
        );
      }

      const employee = await getEmployeeById(id);
      if (!employee) {
        return NextResponse.json(
          { success: false, error: "Employee not found" },
          { status: 404 },
        );
      }

      const policy = await upsertLeavePolicy({
        employee_id: id,
        leave_type: parsed.data.leave_type,
        total_days: parsed.data.total_days,
        expires_at: parsed.data.expires_at ?? null,
      });

      await insertAuditLog({
        actor_id: session.employee_id,
        action: "policy.upsert",
        resource_type: "leave_policy",
        resource_id: policy.id,
        details: {
          employee_id: id,
          leave_type: parsed.data.leave_type,
          total_days: parsed.data.total_days,
        },
        ip_address:
          req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      }).catch(() => {});

      return NextResponse.json({ success: true, data: policy });
    } catch {
      return NextResponse.json(
        { success: false, error: "Failed to upsert policy" },
        { status: 500 },
      );
    }
  },
);
