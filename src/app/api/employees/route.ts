import { NextRequest, NextResponse } from "next/server";
import { SessionData } from "@/types";
import { withAdmin } from "@/lib/auth/middleware";
import { createEmployeeSchema } from "@/lib/leave/validation";
import {
  getAllEmployees,
  createEmployee,
  insertAuditLog,
} from "@/lib/supabase/queries";

export const GET = withAdmin(
  async (
    _req: NextRequest,
    _ctx: { params: Promise<Record<string, string>> },
    _session: SessionData,
  ) => {
    try {
      const employees = await getAllEmployees();
      return NextResponse.json({ success: true, data: employees });
    } catch {
      return NextResponse.json(
        { success: false, error: "Failed to fetch employees" },
        { status: 500 },
      );
    }
  },
);

export const POST = withAdmin(
  async (
    req: NextRequest,
    _ctx: { params: Promise<Record<string, string>> },
    session: SessionData,
  ) => {
    try {
      const body = await req.json();
      const parsed = createEmployeeSchema.safeParse(body);

      if (!parsed.success) {
        const firstError =
          parsed.error.issues[0]?.message ?? "Invalid request body";
        return NextResponse.json(
          { success: false, error: firstError },
          { status: 400 },
        );
      }

      const employee = await createEmployee({
        wallet_address: parsed.data.wallet_address,
        name: parsed.data.name,
        slack_user_id: parsed.data.slack_user_id ?? null,
        start_date: parsed.data.start_date,
        role: parsed.data.role,
        department: parsed.data.department,
        is_manager: parsed.data.is_manager,
      });

      await insertAuditLog({
        actor_id: session.employee_id,
        action: "employee.create",
        resource_type: "employee",
        resource_id: employee.id,
        details: { name: employee.name, role: employee.role },
        ip_address:
          req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      }).catch((err) => console.error("[AuditLog] Failed:", err));

      return NextResponse.json(
        { success: true, data: employee },
        { status: 201 },
      );
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.includes("duplicate key")
      ) {
        return NextResponse.json(
          { success: false, error: "Employee with this wallet already exists" },
          { status: 409 },
        );
      }

      return NextResponse.json(
        { success: false, error: "Failed to create employee" },
        { status: 500 },
      );
    }
  },
);
