import { NextRequest, NextResponse } from "next/server";
import { SessionData } from "@/types";
import { withAdmin } from "@/lib/auth/middleware";
import { updateEmployeeSchema } from "@/lib/leave/validation";
import {
  getEmployeeById,
  updateEmployee,
  insertAuditLog,
} from "@/lib/supabase/queries";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const PATCH = withAdmin(
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
      const parsed = updateEmployeeSchema.safeParse(body);

      if (!parsed.success) {
        const firstError =
          parsed.error.issues[0]?.message ?? "Invalid request body";
        return NextResponse.json(
          { success: false, error: firstError },
          { status: 400 },
        );
      }

      const existing = await getEmployeeById(id);
      if (!existing) {
        return NextResponse.json(
          { success: false, error: "Employee not found" },
          { status: 404 },
        );
      }

      const employee = await updateEmployee(id, parsed.data);

      await insertAuditLog({
        actor_id: session.employee_id,
        action: "employee.update",
        resource_type: "employee",
        resource_id: id,
        details: { updated_fields: Object.keys(parsed.data) },
        ip_address:
          req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      }).catch(() => {});

      return NextResponse.json({ success: true, data: employee });
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.includes("duplicate key")
      ) {
        return NextResponse.json(
          { success: false, error: "Wallet address already in use" },
          { status: 409 },
        );
      }

      return NextResponse.json(
        { success: false, error: "Failed to update employee" },
        { status: 500 },
      );
    }
  },
);
