import "server-only";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * Simple in-memory rate limiter suitable for a small team.
 * Uses a Map with TTL-based cleanup.
 */
class RateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number,
  ) {
    // Periodically clean up expired entries every 60 seconds
    if (typeof setInterval !== "undefined") {
      this.cleanupInterval = setInterval(() => this.cleanup(), 60_000);
      // Allow the Node.js process to exit even if this interval is active
      if (this.cleanupInterval && "unref" in this.cleanupInterval) {
        this.cleanupInterval.unref();
      }
    }
  }

  /**
   * Check if a request from the given key should be allowed.
   * Returns { allowed, remaining, resetAt }.
   */
  check(key: string): {
    allowed: boolean;
    remaining: number;
    resetAt: number;
  } {
    const now = Date.now();
    const entry = this.store.get(key);

    // No existing entry or window has expired
    if (!entry || now >= entry.resetAt) {
      const resetAt = now + this.windowMs;
      this.store.set(key, { count: 1, resetAt });
      return { allowed: true, remaining: this.maxRequests - 1, resetAt };
    }

    // Within the window
    entry.count += 1;
    if (entry.count > this.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: entry.resetAt,
      };
    }

    return {
      allowed: true,
      remaining: this.maxRequests - entry.count,
      resetAt: entry.resetAt,
    };
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now >= entry.resetAt) {
        this.store.delete(key);
      }
    }
  }
}

// Auth endpoints: 5 requests per minute per IP
export const authRateLimiter = new RateLimiter(5, 60_000);

// General API endpoints: 60 requests per minute per IP
export const apiRateLimiter = new RateLimiter(60, 60_000);

/**
 * Extract the client IP from the request.
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]!.trim();
  }
  // Fallback for local development
  return "127.0.0.1";
}
