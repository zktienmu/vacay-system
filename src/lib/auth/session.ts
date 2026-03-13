import { SessionOptions } from "iron-session";
import { SessionData } from "@/types";

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET!,
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
};
