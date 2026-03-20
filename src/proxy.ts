import { NextRequest, NextResponse } from "next/server";
import { apiRateLimiter, getClientIp } from "@/lib/security/rate-limit";

const PUBLIC_API_ROUTES = ["/api/auth/nonce", "/api/auth/verify"];
const PUBLIC_PAGES = ["/login"];
const SESSION_COOKIE = "vaca_session";
const STATE_CHANGING_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = req.cookies.has(SESSION_COOKIE);

  // CSRF / Origin check on state-changing requests
  if (STATE_CHANGING_METHODS.has(req.method)) {
    const origin = req.headers.get("origin");
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;

    if (!origin || !appUrl) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }

    const expectedOrigin = new URL(appUrl).origin;
    if (origin !== expectedOrigin) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }
  }

  // Rate limit API routes (auth endpoints have their own stricter limiter)
  if (pathname.startsWith("/api/") && !pathname.startsWith("/api/auth/")) {
    const ip = getClientIp(req);
    const limit = apiRateLimiter.check(`api:${ip}`);
    if (!limit.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many requests" },
        { status: 429 },
      );
    }
  }

  // Security headers for all responses
  const response = getResponse(req, pathname, hasSession);

  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      // Next.js requires unsafe-eval in dev; scripts from WalletConnect
      "script-src 'self' 'unsafe-inline' https://*.walletconnect.com https://*.reown.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.walletconnect.com https://*.reown.com wss://*.walletconnect.com wss://*.reown.com https://*.supabase.co",
      "frame-src 'self' https://*.walletconnect.com https://*.reown.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  );
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains",
  );

  return response;
}

function getResponse(
  req: NextRequest,
  pathname: string,
  hasSession: boolean,
): NextResponse {
  // Public auth API routes — always allow
  if (PUBLIC_API_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Logout is accessible whether or not you have a session
  if (pathname === "/api/auth/logout") {
    return NextResponse.next();
  }

  // Protected API routes — require session cookie
  if (pathname.startsWith("/api/")) {
    if (!hasSession) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }
    return NextResponse.next();
  }

  // Root redirect
  if (pathname === "/") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // Public pages
  if (PUBLIC_PAGES.some((page) => pathname.startsWith(page))) {
    // If already logged in, redirect to dashboard
    if (hasSession) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    return NextResponse.next();
  }

  // All other pages — require session cookie
  if (!hasSession) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, sitemap.xml, robots.txt
     * - public assets
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.png$|.*\\.svg$|.*\\.jpg$|.*\\.jpeg$|.*\\.gif$|.*\\.ico$).*)",
  ],
};
