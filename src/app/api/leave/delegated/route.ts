import { NextRequest, NextResponse } from "next/server";
import { SessionData } from "@/types";
import { withAuth } from "@/lib/auth/middleware";
import { getDelegatedLeaves, getEmployeeById } from "@/lib/supabase/queries";

export const GET = withAuth(
  async (
    _req: NextRequest,
    _ctx: { params: Promise<Record<string, string>> },
    session: SessionData,
  ) => {
    try {
      const leaves = await getDelegatedLeaves(session.employee_id);

      // Enrich with requester info
      const enriched = await Promise.all(
        leaves.map(async (leave) => {
          const employee = await getEmployeeById(leave.employee_id);
          return {
            ...leave,
            employee: employee
              ? { id: employee.id, name: employee.name }
              : null,
          };
        }),
      );

      return NextResponse.json({ success: true, data: enriched });
    } catch {
      return NextResponse.json(
        { success: false, error: "Failed to fetch delegated leaves" },
        { status: 500 },
      );
    }
  },
);
