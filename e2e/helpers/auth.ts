import { sealData } from "iron-session";
import type { Page } from "@playwright/test";

const COOKIE_NAME = "dinngo_leave_session";
const SESSION_SECRET = process.env.SESSION_SECRET ?? "";

export interface TestSession {
  employee_id: string;
  wallet_address: string;
  name: string;
  role: "admin" | "employee";
  department: "engineering" | "admin";
  is_manager: boolean;
}

export const TEST_SESSIONS: Record<string, TestSession> = {
  employee: {
    employee_id: "test-employee-001",
    wallet_address: "0x1234567890abcdef1234567890abcdef12345678",
    name: "Test Employee",
    role: "employee",
    department: "engineering",
    is_manager: false,
  },
  admin: {
    employee_id: "test-admin-001",
    wallet_address: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    name: "Test Admin",
    role: "admin",
    department: "admin",
    is_manager: false,
  },
  manager: {
    employee_id: "test-manager-001",
    wallet_address: "0x9876543210fedcba9876543210fedcba98765432",
    name: "Test Manager",
    role: "employee",
    department: "engineering",
    is_manager: true,
  },
};

async function sealSession(session: TestSession) {
  return sealData(session, { password: SESSION_SECRET });
}

export async function createSessionCookie(
  role: "employee" | "admin" | "manager" = "employee",
) {
  const session = TEST_SESSIONS[role];
  const sealed = await sealSession(session);

  return {
    name: COOKIE_NAME,
    value: sealed,
    domain: "localhost",
    path: "/",
    httpOnly: true,
    secure: false,
    sameSite: "Lax" as const,
  };
}

/**
 * Intercept /api/auth/me to return mock session data.
 * This bypasses the DB check in withAuth middleware.
 */
export async function mockAuthApi(page: Page, role: "employee" | "admin" | "manager") {
  const session = TEST_SESSIONS[role];

  await page.route("**/api/auth/me", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: session,
      }),
    });
  });
}
