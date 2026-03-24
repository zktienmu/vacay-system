import { NextRequest, NextResponse } from "next/server";
import { apiRateLimiter, getClientIp } from "@/lib/security/rate-limit";

const PUBLIC_API_ROUTES = ["/api/auth/nonce", "/api/auth/verify"];
const PUBLIC_PAGES = ["/login"];
const SESSION_COOKIE = "dinngo_leave_session";
const STATE_CHANGING_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

export async function proxy(req: NextRequest) {
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
    const limit = await apiRateLimiter.check(`api:${ip}`);
    if (!limit.allowed) {
      const retryAfter = Math.ceil((limit.resetAt - Date.now()) / 1000);
      const res = NextResponse.json(
        { success: false, error: "Too many requests" },
        { status: 429 },
      );
      res.headers.set("Retry-After", String(retryAfter));
      return res;
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
  // Content-Security-Policy — tightened while keeping Reown AppKit (Web3 wallet) working
  // Each directive is explained:
  //   default-src 'self'                — baseline: only same-origin
  //   script-src 'unsafe-inline' 'unsafe-eval' — Next.js inline scripts + AppKit eval usage
  //   style-src 'unsafe-inline'         — Tailwind + AppKit inject inline styles
  //   img-src data: blob: https:        — wallet icons served from various CDNs
  //   font-src data:                    — Next.js font loading + AppKit fonts
  //   connect-src                       — API calls + WalletConnect relay/RPC/pulse + AppKit API
  //   frame-src                         — WalletConnect verify iframe + secure mobile bridge
  //   frame-ancestors 'none'            — prevent this app from being embedded (clickjacking)
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.reown.com",
    [
      "connect-src 'self'",
      "https://*.walletconnect.com",
      "https://*.walletconnect.org",
      "https://*.reown.com",
      "https://*.web3modal.org",
      "wss://*.walletconnect.com",
      "wss://*.walletconnect.org",
      "wss://*.reown.com",
    ].join(" "),
    [
      "frame-src 'self'",
      "https://*.walletconnect.com",
      "https://*.walletconnect.org",
      "https://*.reown.com",
    ].join(" "),
    "frame-ancestors 'none'",
  ].join("; ");
  response.headers.set("Content-Security-Policy", csp);
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
