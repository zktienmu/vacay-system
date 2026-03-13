import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { SessionData } from "@/types";
import { sessionOptions } from "@/lib/auth/session";
import { insertAuditLog } from "@/lib/supabase/queries";
import { getClientIp } from "@/lib/security/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const session = await getIronSession<SessionData>(
      await cookies(),
      sessionOptions,
    );

    const employeeId = session.employee_id;

    // Log logout event before destroying session
    if (employeeId) {
      await insertAuditLog({
        actor_id: employeeId,
        action: "auth.logout",
        resource_type: "employee",
        resource_id: employeeId,
        details: null,
        ip_address: getClientIp(req),
      }).catch(() => {
        // Audit log failure should not break logout
      });
    }

    session.destroy();

    return NextResponse.json({ success: true, data: null });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to logout" },
      { status: 500 },
    );
  }
}
