import { SessionOptions } from "iron-session";
import { SessionData } from "@/types";

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET ?? "";
  if (secret.length < 32) {
    throw new Error(
      "SESSION_SECRET must be at least 32 characters long. " +
        `Current length: ${secret.length}`,
    );
  }
  return secret;
}

export const sessionOptions: SessionOptions = {
  get password() {
    return getSessionSecret();
  },
  cookieName: "vaca_session",
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 8 * 60 * 60, // 8 hours
    path: "/",
  },
};

export const defaultSession: SessionData = {
  employee_id: "",
  wallet_address: "",
  name: "",
  role: "employee",
  department: "engineering",
  is_manager: false,
  nonce: undefined,
  nonce_issued_at: undefined,
};
