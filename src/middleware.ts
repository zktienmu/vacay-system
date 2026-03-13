import { NextRequest, NextResponse } from "next/server";

const PUBLIC_API_ROUTES = ["/api/auth/nonce", "/api/auth/verify"];
const PUBLIC_PAGES = ["/login"];
const SESSION_COOKIE = "vaca_session";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = req.cookies.has(SESSION_COOKIE);

  // Security headers for all responses
  const response = getResponse(req, pathname, hasSession);
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
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
