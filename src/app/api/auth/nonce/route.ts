import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { SessionData } from "@/types";
import { sessionOptions } from "@/lib/auth/session";
import { generateNonce } from "@/lib/auth/siwe";
import { authRateLimiter, getClientIp } from "@/lib/security/rate-limit";

export async function GET(req: NextRequest) {
  try {
    // Rate limit: auth endpoints
    const ip = getClientIp(req);
    const limit = authRateLimiter.check(`nonce:${ip}`);
    if (!limit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many requests" },
        { status: 429 },
      );
    }

    const session = await getIronSession<SessionData>(
      await cookies(),
      sessionOptions,
    );

    const nonce = generateNonce();
    session.nonce = nonce;
    session.nonce_issued_at = Date.now();
    await session.save();

    return NextResponse.json({ success: true, data: { nonce } });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to generate nonce" },
      { status: 500 },
    );
  }
}
