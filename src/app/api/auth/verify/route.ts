import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { SessionData } from "@/types";
import { sessionOptions } from "@/lib/auth/session";
import { verifySiweMessage } from "@/lib/auth/siwe";
import { siweVerifySchema } from "@/lib/leave/validation";
import { getEmployeeByWallet, insertAuditLog } from "@/lib/supabase/queries";

export async function POST(req: NextRequest) {
  try {
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

    const walletAddress = await verifySiweMessage(
      message,
      signature,
      session.nonce,
    );

    const employee = await getEmployeeByWallet(walletAddress);

    if (!employee) {
      return NextResponse.json(
        { success: false, error: "Not registered" },
        { status: 403 },
      );
    }

    session.employee_id = employee.id;
    session.wallet_address = employee.wallet_address;
    session.name = employee.name;
    session.role = employee.role;
    session.nonce = undefined;
    await session.save();

    await insertAuditLog({
      actor_id: employee.id,
      action: "auth.login",
      resource_type: "employee",
      resource_id: employee.id,
      details: { wallet_address: employee.wallet_address },
      ip_address:
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    }).catch(() => {
      // Audit log failure should not break login
    });

    return NextResponse.json({
      success: true,
      data: {
        employee_id: employee.id,
        wallet_address: employee.wallet_address,
        name: employee.name,
        role: employee.role,
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Verification failed";

    // Return specific SIWE errors to the client for UX
    if (
      message.includes("mismatch") ||
      message.includes("Signature") ||
      message.includes("Expired")
    ) {
      return NextResponse.json(
        { success: false, error: message },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { success: false, error: "Verification failed" },
      { status: 500 },
    );
  }
}
