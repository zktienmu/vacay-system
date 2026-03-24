import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

// ---------------------------------------------------------------------------
// In-memory fallback (used when Upstash env vars are not configured)
// ---------------------------------------------------------------------------

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

class InMemoryRateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number,
  ) {
    if (typeof setInterval !== "undefined") {
      this.cleanupInterval = setInterval(() => this.cleanup(), 60_000);
      if (this.cleanupInterval && "unref" in this.cleanupInterval) {
        this.cleanupInterval.unref();
      }
    }
  }

  check(key: string): RateLimitResult {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || now >= entry.resetAt) {
      const resetAt = now + this.windowMs;
      this.store.set(key, { count: 1, resetAt });
      return { allowed: true, remaining: this.maxRequests - 1, resetAt };
    }

    entry.count += 1;
    if (entry.count > this.maxRequests) {
      return { allowed: false, remaining: 0, resetAt: entry.resetAt };
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

// ---------------------------------------------------------------------------
// Upstash Redis rate limiter (persistent across serverless cold starts)
// ---------------------------------------------------------------------------

class UpstashRateLimiter {
  private limiter: Ratelimit;

  constructor(maxRequests: number, windowMs: number, redis: Redis) {
    this.limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.fixedWindow(maxRequests, `${windowMs}ms`),
      prefix: "vaca:rl",
    });
  }

  async check(key: string): Promise<RateLimitResult> {
    const result = await this.limiter.limit(key);
    return {
      allowed: result.success,
      remaining: result.remaining,
      resetAt: result.reset,
    };
  }
}

// ---------------------------------------------------------------------------
// Unified interface — async check(), works with both backends
// ---------------------------------------------------------------------------

interface RateLimiterInterface {
  check(key: string): Promise<RateLimitResult> | RateLimitResult;
}

class AsyncInMemoryRateLimiter implements RateLimiterInterface {
  private inner: InMemoryRateLimiter;

  constructor(maxRequests: number, windowMs: number) {
    this.inner = new InMemoryRateLimiter(maxRequests, windowMs);
  }

  check(key: string): RateLimitResult {
    return this.inner.check(key);
  }
}

// ---------------------------------------------------------------------------
// Factory — picks backend based on environment variables
// ---------------------------------------------------------------------------

function hasUpstashConfig(): boolean {
  return !!(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

function createRateLimiter(
  maxRequests: number,
  windowMs: number,
): RateLimiterInterface {
  if (hasUpstashConfig()) {
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
    return new UpstashRateLimiter(maxRequests, windowMs, redis);
  }

  return new AsyncInMemoryRateLimiter(maxRequests, windowMs);
}

// Auth endpoints: 5 requests per minute per IP
export const authRateLimiter: RateLimiterInterface = createRateLimiter(
  5,
  60_000,
);

// General API endpoints: 60 requests per minute per IP
export const apiRateLimiter: RateLimiterInterface = createRateLimiter(
  60,
  60_000,
);

/**
 * Extract the client IP from the request.
 * Prefers x-real-ip (set by Vercel/reverse proxy, harder to spoof),
 * then falls back to the last IP in x-forwarded-for (added by the proxy).
 */
export function getClientIp(req: Request): string {
  // x-real-ip is set by Vercel/reverse proxy and is harder to spoof
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp;

  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    // Only trust the last IP (added by the reverse proxy)
    const ips = forwarded.split(",").map((ip) => ip.trim());
    return ips[ips.length - 1]!;
  }

  // Fallback for local development
  return "127.0.0.1";
}
