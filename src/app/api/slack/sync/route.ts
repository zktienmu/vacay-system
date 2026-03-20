import { NextRequest, NextResponse } from "next/server";
import { SessionData } from "@/types";
import { withAdmin } from "@/lib/auth/middleware";
import { syncSlackUsers } from "@/lib/slack/sync";

export const POST = withAdmin(
  async (
    _req: NextRequest,
    _ctx: { params: Promise<Record<string, string>> },
    _session: SessionData,
  ) => {
    try {
      const result = await syncSlackUsers();
      return NextResponse.json({ success: true, data: result });
    } catch (err) {
      console.error("[Slack Sync] Failed:", err);
      return NextResponse.json(
        { success: false, error: "Failed to sync Slack users" },
        { status: 500 },
      );
    }
  },
);
