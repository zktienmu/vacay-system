import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { SessionData } from "@/types";
import { sessionOptions } from "@/lib/auth/session";
import { verifySiweMessage } from "@/lib/auth/siwe";
import { siweVerifySchema } from "@/lib/leave/validation";
import { getEmployeeByWallet, insertAuditLog } from "@/lib/supabase/queries";
import { authRateLimiter, getClientIp } from "@/lib/security/rate-limit";

// Nonce TTL: 5 minutes
const NONCE_TTL_MS = 5 * 60 * 1000;

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);

  try {
    // Rate limit: auth endpoints
    const limit = await authRateLimiter.check(`verify:${ip}`);
    if (!limit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many requests" },
        { status: 429 },
      );
    }

    const body = await req.json();
    const parsed = siweVerifySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request body" },
        { status: 400 },
      );
    }

    const { message, signature } = parsed.data;

    const session = await getIronSession<SessionData>(
      await cookies(),
      sessionOptions,
    );

    if (!session.nonce) {
      return NextResponse.json(
        { success: false, error: "No nonce found. Request a nonce first." },
        { status: 400 },
      );
    }

    // Enforce nonce TTL
    if (
      !session.nonce_issued_at ||
      Date.now() - session.nonce_issued_at > NONCE_TTL_MS
    ) {
      // Clear the expired nonce
      session.nonce = undefined;
      session.nonce_issued_at = undefined;
      await session.save();

      return NextResponse.json(
        { success: false, error: "Nonce expired. Please request a new one." },
        { status: 400 },
      );
    }

    let walletAddress: string;
    try {
      walletAddress = await verifySiweMessage(
        message,
        signature,
        session.nonce,
      );
    } catch {
      // Invalidate nonce after failed verification (single-use)
      session.nonce = undefined;
      session.nonce_issued_at = undefined;
      await session.save();

      // Log failed login attempt
      await insertAuditLog({
        actor_id: "unknown",
        action: "auth.login_failed",
        resource_type: "auth",
        resource_id: "unknown",
        details: { reason: "SIWE verification failed" },
        ip_address: ip,
      }).catch((err) => console.error("[AuditLog] Failed:", err));

      return NextResponse.json(
        { success: false, error: "Signature verification failed" },
        { status: 400 },
      );
    }

    // Invalidate nonce after successful use (single-use)
    session.nonce = undefined;
    session.nonce_issued_at = undefined;

    const employee = await getEmployeeByWallet(walletAddress);

    if (!employee) {
      await session.save();

      // Log unregistered wallet attempt
      await insertAuditLog({
        actor_id: "unknown",
        action: "auth.login_failed",
        resource_type: "auth",
        resource_id: "unknown",
        details: { reason: "Wallet not registered" },
        ip_address: ip,
      }).catch((err) => console.error("[AuditLog] Failed:", err));

      return NextResponse.json(
        { success: false, error: "Not registered" },
        { status: 403 },
      );
    }

    session.employee_id = employee.id;
    session.wallet_address = employee.wallet_address;
    session.name = employee.name;
    session.role = employee.role;
    session.department = employee.department;
    session.is_manager = employee.is_manager;
    await session.save();

    await insertAuditLog({
      actor_id: employee.id,
      action: "auth.login",
      resource_type: "employee",
      resource_id: employee.id,
      details: { wallet_address: employee.wallet_address },
      ip_address: ip,
    }).catch((err) => {
      // Audit log failure should not break login
      console.error("[AuditLog] Failed:", err);
    });

    return NextResponse.json({
      success: true,
      data: {
        employee_id: employee.id,
        wallet_address: employee.wallet_address,
        name: employee.name,
        role: employee.role,
        department: employee.department,
        is_manager: employee.is_manager,
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Verification failed" },
      { status: 500 },
    );
  }
}
