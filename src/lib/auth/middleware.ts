import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { SessionData } from "@/types";
import { sessionOptions } from "@/lib/auth/session";
import { getEmployeeById } from "@/lib/supabase/queries";

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

      // Re-validate role from database on every request to detect
      // role changes or employee deletion since the session was issued.
      const employee = await getEmployeeById(session.employee_id);

      if (!employee) {
        // Employee was deleted — destroy session
        session.destroy();
        return NextResponse.json(
          { success: false, error: "Unauthorized" },
          { status: 401 },
        );
      }

      if (employee.role !== session.role) {
        // Role changed since login — update session
        session.role = employee.role;
        await session.save();
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
