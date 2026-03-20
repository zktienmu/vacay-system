import { NextRequest, NextResponse } from "next/server";
import { SessionData } from "@/types";
import { withAdmin } from "@/lib/auth/middleware";
import { upsertPoliciesBatchSchema } from "@/lib/leave/validation";
import {
  getEmployeeById,
  getLeavePolicies,
  upsertLeavePolicy,
  insertAuditLog,
} from "@/lib/supabase/queries";
import { getClientIp } from "@/lib/security/rate-limit";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET = withAdmin(
  async (
    _req: NextRequest,
    ctx: { params: Promise<Record<string, string>> },
    _session: SessionData,
  ) => {
    try {
      const { id } = await ctx.params;

      if (!UUID_REGEX.test(id)) {
        return NextResponse.json(
          { success: false, error: "Invalid employee ID" },
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

      if (!UUID_REGEX.test(id)) {
        return NextResponse.json(
          { success: false, error: "Invalid employee ID" },
          { status: 400 },
        );
      }

      const body = await req.json();
      const parsed = upsertPoliciesBatchSchema.safeParse(body);

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

      const results = [];
      for (const p of parsed.data.policies) {
        const policy = await upsertLeavePolicy({
          employee_id: id,
          leave_type: p.leave_type,
          total_days: p.total_days,
          expires_at: p.expires_at ?? null,
        });
        results.push(policy);
      }

      await insertAuditLog({
        actor_id: session.employee_id,
        action: "policy.upsert_batch",
        resource_type: "leave_policy",
        resource_id: id,
        details: {
          employee_id: id,
          policies: parsed.data.policies.map((p) => ({
            leave_type: p.leave_type,
            total_days: p.total_days,
          })),
        },
        ip_address: getClientIp(req),
      }).catch((err) => console.error("[AuditLog] Failed:", err));

      return NextResponse.json({ success: true, data: results });
    } catch {
      return NextResponse.json(
        { success: false, error: "Failed to upsert policy" },
        { status: 500 },
      );
    }
  },
);
