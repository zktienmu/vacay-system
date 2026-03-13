import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { SessionData } from "@/types";
import { sessionOptions } from "@/lib/auth/session";

type RouteHandlerContext = { params: Promise<Record<string, string>> };

type AuthHandler = (
  req: NextRequest,
  ctx: RouteHandlerContext,
  session: SessionData,
) => Promise<NextResponse>;

export function withAuth(handler: AuthHandler) {
  return async (req: NextRequest, ctx: RouteHandlerContext): Promise<NextResponse> => {
    try {
      const session = await getIronSession<SessionData>(
        await cookies(),
        sessionOptions,
      );

      if (!session.employee_id) {
        return NextResponse.json(
          { success: false, error: "Unauthorized" },
          { status: 401 },
        );
      }

      return handler(req, ctx, session);
    } catch {
      return NextResponse.json(
        { success: false, error: "Internal server error" },
        { status: 500 },
      );
    }
  };
}

export function withAdmin(handler: AuthHandler) {
  return withAuth(async (req, ctx, session) => {
    if (session.role !== "admin") {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }

    return handler(req, ctx, session);
  });
}
