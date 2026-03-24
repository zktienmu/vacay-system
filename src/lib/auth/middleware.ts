import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { Employee, SessionData } from "@/types";
import { sessionOptions } from "@/lib/auth/session";
import { getEmployeeById } from "@/lib/supabase/queries";

type RouteHandlerContext = { params: Promise<Record<string, string>> };

type AuthHandler = (
  req: NextRequest,
  ctx: RouteHandlerContext,
  session: SessionData,
) => Promise<NextResponse>;

// --- In-memory employee cache (60s TTL) ---
// Reduces redundant DB lookups for employee role/department/is_manager
// which rarely change. Naturally resets on serverless cold starts.

interface CacheEntry {
  employee: Employee;
  expiresAt: number;
}

const AUTH_CACHE_TTL_MS = 60_000; // 60 seconds

const employeeCache = new Map<string, CacheEntry>();

function getCachedEmployee(employeeId: string): Employee | null {
  const entry = employeeCache.get(employeeId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    employeeCache.delete(employeeId);
    return null;
  }
  return entry.employee;
}

function setCachedEmployee(employeeId: string, employee: Employee): void {
  employeeCache.set(employeeId, {
    employee,
    expiresAt: Date.now() + AUTH_CACHE_TTL_MS,
  });
}

/** Clear the auth employee cache. Useful for testing. */
export function clearAuthCache(): void {
  employeeCache.clear();
}

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

      // Re-validate role from database, using short-lived cache to
      // avoid hitting Supabase on every single request.
      let employee = getCachedEmployee(session.employee_id);
      if (!employee) {
        const fetched = await getEmployeeById(session.employee_id);
        if (!fetched) {
          // Employee was deleted — destroy session
          session.destroy();
          return NextResponse.json(
            { success: false, error: "Unauthorized" },
            { status: 401 },
          );
        }
        employee = fetched;
        setCachedEmployee(session.employee_id, employee);
      }

      // Sync session with database if role, department, or is_manager changed
      let sessionChanged = false;
      if (employee.role !== session.role) {
        session.role = employee.role;
        sessionChanged = true;
      }
      if (employee.department !== session.department) {
        session.department = employee.department;
        sessionChanged = true;
      }
      if (employee.is_manager !== session.is_manager) {
        session.is_manager = employee.is_manager;
        sessionChanged = true;
      }
      if (sessionChanged) {
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
    if (session.role !== "admin" && !session.is_manager) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }

    return handler(req, ctx, session);
  });
}

/**
 * Middleware that allows both system admins and managers to access the route.
 * Used for leave approval endpoints where any department manager can approve.
 */
export function withApprover(handler: AuthHandler) {
  return withAuth(async (req, ctx, session) => {
    if (session.role !== "admin" && !session.is_manager) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }

    return handler(req, ctx, session);
  });
}
