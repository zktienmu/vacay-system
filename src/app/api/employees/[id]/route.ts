import { NextRequest, NextResponse } from "next/server";
import { SessionData } from "@/types";
import { withAdmin } from "@/lib/auth/middleware";
import { updateEmployeeSchema } from "@/lib/leave/validation";
import {
  getEmployeeById,
  updateEmployee,
  deleteEmployee,
  insertAuditLog,
  getAdminCount,
} from "@/lib/supabase/queries";
import { getClientIp } from "@/lib/security/rate-limit";

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

      // Prevent demoting the last admin
      if (
        parsed.data.role === "employee" &&
        existing.role === "admin"
      ) {
        const adminCount = await getAdminCount();
        if (adminCount <= 1) {
          return NextResponse.json(
            {
              success: false,
              error: "Cannot demote the last admin",
            },
            { status: 400 },
          );
        }
      }

      const employee = await updateEmployee(id, parsed.data);

      await insertAuditLog({
        actor_id: session.employee_id,
        action: "employee.update",
        resource_type: "employee",
        resource_id: id,
        details: { updated_fields: Object.keys(parsed.data) },
        ip_address: getClientIp(req),
      }).catch((err) => console.error("[AuditLog] Failed:", err));

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

export const DELETE = withAdmin(
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

      // Cannot delete yourself
      if (id === session.employee_id) {
        return NextResponse.json(
          { success: false, error: "Cannot delete yourself" },
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

      // Prevent deleting the last admin
      if (existing.role === "admin") {
        const adminCount = await getAdminCount();
        if (adminCount <= 1) {
          return NextResponse.json(
            { success: false, error: "Cannot delete the last admin" },
            { status: 400 },
          );
        }
      }

      await deleteEmployee(id);

      await insertAuditLog({
        actor_id: session.employee_id,
        action: "employee.delete",
        resource_type: "employee",
        resource_id: id,
        details: { name: existing.name, role: existing.role },
        ip_address: getClientIp(req),
      }).catch((err) => console.error("[AuditLog] Failed:", err));

      return NextResponse.json({ success: true });
    } catch {
      return NextResponse.json(
        { success: false, error: "Failed to delete employee" },
        { status: 500 },
      );
    }
  },
);
