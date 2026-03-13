import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { SessionData } from "@/types";
import { sessionOptions } from "@/lib/auth/session";

export async function POST() {
  try {
    const session = await getIronSession<SessionData>(
      await cookies(),
      sessionOptions,
    );

    session.destroy();

    return NextResponse.json({ success: true, data: null });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to logout" },
      { status: 500 },
    );
  }
}
