import { NextRequest, NextResponse } from "next/server";
import { SessionData } from "@/types";
import { withAuth } from "@/lib/auth/middleware";
import { getSlackUsers } from "@/lib/slack/users";

export const GET = withAuth(
  async (
    _req: NextRequest,
    _ctx: { params: Promise<Record<string, string>> },
    session: SessionData,
  ) => {
    try {
      const users = await getSlackUsers(session.employee_id);
      return NextResponse.json({ success: true, data: users });
    } catch {
      return NextResponse.json(
        { success: false, error: "Failed to fetch Slack users" },
        { status: 500 },
      );
    }
  },
);
