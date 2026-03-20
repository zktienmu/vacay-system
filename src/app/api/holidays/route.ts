import { NextRequest, NextResponse } from "next/server";
import { SessionData } from "@/types";
import { withAuth, withAdmin } from "@/lib/auth/middleware";
import { createHolidaySchema } from "@/lib/leave/validation";
import {
  getPublicHolidays,
  createPublicHoliday,
  insertAuditLog,
} from "@/lib/supabase/queries";

export const GET = withAuth(
  async (
    req: NextRequest,
    _ctx: { params: Promise<Record<string, string>> },
    _session: SessionData,
  ) => {
    try {
      const { searchParams } = new URL(req.url);
      const yearParam = searchParams.get("year");
      const year = yearParam ? parseInt(yearParam, 10) : undefined;

      if (yearParam && (!year || isNaN(year))) {
        return NextResponse.json(
          { success: false, error: "Invalid year parameter" },
          { status: 400 },
        );
      }

      const holidays = await getPublicHolidays(year);
      return NextResponse.json({ success: true, data: holidays });
    } catch {
      return NextResponse.json(
        { success: false, error: "Failed to fetch holidays" },
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
      const parsed = createHolidaySchema.safeParse(body);

      if (!parsed.success) {
        const firstError =
          parsed.error.issues[0]?.message ?? "Invalid request body";
        return NextResponse.json(
          { success: false, error: firstError },
          { status: 400 },
        );
      }

      const holiday = await createPublicHoliday({
        date: parsed.data.date,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        year: parsed.data.year,
      });

      await insertAuditLog({
        actor_id: session.employee_id,
        action: "holiday.create",
        resource_type: "public_holiday",
        resource_id: holiday.id,
        details: { name: holiday.name, date: holiday.date },
        ip_address:
          req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      }).catch((err) => console.error("[AuditLog] Failed:", err));

      return NextResponse.json(
        { success: true, data: holiday },
        { status: 201 },
      );
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.includes("duplicate key")
      ) {
        return NextResponse.json(
          { success: false, error: "A holiday already exists on this date" },
          { status: 409 },
        );
      }

      return NextResponse.json(
        { success: false, error: "Failed to create holiday" },
        { status: 500 },
      );
    }
  },
);
