import { NextRequest, NextResponse } from "next/server";
import { SessionData } from "@/types";
import { withAdmin } from "@/lib/auth/middleware";
import {
  deletePublicHoliday,
  insertAuditLog,
} from "@/lib/supabase/queries";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
          { success: false, error: "Invalid holiday ID" },
          { status: 400 },
        );
      }

      await deletePublicHoliday(id);

      await insertAuditLog({
        actor_id: session.employee_id,
        action: "holiday.delete",
        resource_type: "public_holiday",
        resource_id: id,
        details: null,
        ip_address:
          req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      }).catch(() => {});

      return NextResponse.json({ success: true });
    } catch {
      return NextResponse.json(
        { success: false, error: "Failed to delete holiday" },
        { status: 500 },
      );
    }
  },
);
