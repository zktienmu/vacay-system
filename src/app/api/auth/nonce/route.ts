import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { SessionData } from "@/types";
import { sessionOptions } from "@/lib/auth/session";
import { generateNonce } from "@/lib/auth/siwe";

export async function GET() {
  try {
    const session = await getIronSession<SessionData>(
      await cookies(),
      sessionOptions,
    );

    const nonce = generateNonce();
    session.nonce = nonce;
    await session.save();

    return NextResponse.json({ success: true, data: { nonce } });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to generate nonce" },
      { status: 500 },
    );
  }
}
