import { NextRequest, NextResponse } from "next/server";
import { SessionData } from "@/types";
import { withAuth } from "@/lib/auth/middleware";
import { getAllEmployees } from "@/lib/supabase/queries";

/** Lightweight employee list for delegate selection — any authenticated user. */
export const GET = withAuth(
  async (
    _req: NextRequest,
    _ctx: { params: Promise<Record<string, string>> },
    _session: SessionData,
  ) => {
    try {
      const employees = await getAllEmployees();
      const list = employees.map((e) => ({ id: e.id, name: e.name }));
      return NextResponse.json({ success: true, data: list });
    } catch {
      return NextResponse.json(
        { success: false, error: "Failed to fetch employees" },
        { status: 500 },
      );
    }
  },
);
