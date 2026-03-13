import { NextRequest, NextResponse } from "next/server";
import { SessionData } from "@/types";
import { withAuth } from "@/lib/auth/middleware";

export const GET = withAuth(
  async (
    _req: NextRequest,
    _ctx: { params: Promise<Record<string, string>> },
    session: SessionData,
  ) => {
    return NextResponse.json({
      success: true,
      data: {
        employee_id: session.employee_id,
        wallet_address: session.wallet_address,
        name: session.name,
        role: session.role,
      },
    });
  },
);
