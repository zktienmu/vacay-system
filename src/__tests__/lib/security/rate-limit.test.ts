import { describe, it, expect, vi, beforeEach } from 'vitest'
import { authRateLimiter, apiRateLimiter, getClientIp } from '@/lib/security/rate-limit'

describe('getClientIp', () => {
  it('prefers x-real-ip over x-forwarded-for', () => {
    const req = new Request('http://localhost', {
      headers: { 'x-real-ip': '9.9.9.9', 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
    })
    expect(getClientIp(req)).toBe('9.9.9.9')
  })

  it('uses last IP from x-forwarded-for (proxy-added)', () => {
    const req = new Request('http://localhost', {
      headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
    })
    expect(getClientIp(req)).toBe('5.6.7.8')
  })

  it('returns single IP from x-forwarded-for', () => {
    const req = new Request('http://localhost', {
      headers: { 'x-forwarded-for': '10.0.0.1' },
    })
    expect(getClientIp(req)).toBe('10.0.0.1')
  })

  it('trims whitespace from forwarded IP', () => {
    const req = new Request('http://localhost', {
      headers: { 'x-forwarded-for': '  1.2.3.4  , 5.6.7.8  ' },
    })
    expect(getClientIp(req)).toBe('5.6.7.8')
  })

  it('falls back to 127.0.0.1 when no forwarded header', () => {
    const req = new Request('http://localhost')
    expect(getClientIp(req)).toBe('127.0.0.1')
  })
})

describe('fallback in-memory rate limiter', () => {
  // Tests run without UPSTASH_REDIS_REST_URL/TOKEN, so the in-memory fallback is used.

  describe('authRateLimiter (5 requests per 60 seconds)', () => {
    it('allows the first request', async () => {
      const result = await authRateLimiter.check('test-ip-auth-first')
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(4) // 5 - 1
    })

    it('allows up to 5 requests', async () => {
      const key = 'test-ip-auth-5-' + Math.random()
      for (let i = 0; i < 5; i++) {
        const result = await authRateLimiter.check(key)
        expect(result.allowed).toBe(true)
      }
    })

    it('blocks the 6th request', async () => {
      const key = 'test-ip-auth-6-' + Math.random()
      for (let i = 0; i < 5; i++) {
        await authRateLimiter.check(key)
      }
      const result = await authRateLimiter.check(key)
      expect(result.allowed).toBe(false)
      expect(result.remaining).toBe(0)
    })

    it('tracks remaining count correctly', async () => {
      const key = 'test-ip-remaining-' + Math.random()
      expect((await authRateLimiter.check(key)).remaining).toBe(4)
      expect((await authRateLimiter.check(key)).remaining).toBe(3)
      expect((await authRateLimiter.check(key)).remaining).toBe(2)
      expect((await authRateLimiter.check(key)).remaining).toBe(1)
      expect((await authRateLimiter.check(key)).remaining).toBe(0)
    })

    it('provides a resetAt timestamp in the future', async () => {
      const now = Date.now()
      const result = await authRateLimiter.check('test-ip-reset-' + Math.random())
      expect(result.resetAt).toBeGreaterThan(now)
    })
  })

  describe('apiRateLimiter (60 requests per 60 seconds)', () => {
    it('allows the first request', async () => {
      const result = await apiRateLimiter.check('api-test-1-' + Math.random())
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(59) // 60 - 1
    })

    it('allows up to 60 requests', async () => {
      const key = 'api-test-60-' + Math.random()
      for (let i = 0; i < 60; i++) {
        const result = await apiRateLimiter.check(key)
        expect(result.allowed).toBe(true)
      }
    })

    it('blocks the 61st request', async () => {
      const key = 'api-test-61-' + Math.random()
      for (let i = 0; i < 60; i++) {
        await apiRateLimiter.check(key)
      }
      const result = await apiRateLimiter.check(key)
      expect(result.allowed).toBe(false)
    })
  })

  describe('isolation between keys', () => {
    it('tracks different keys independently', async () => {
      const suffix = Math.random()
      const key1 = 'ip-a-' + suffix
      const key2 = 'ip-b-' + suffix

      // Exhaust key1
      for (let i = 0; i < 5; i++) {
        await authRateLimiter.check(key1)
      }

      // key2 should still be allowed
      const result = await authRateLimiter.check(key2)
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(4)

      // key1 should be blocked
      const blocked = await authRateLimiter.check(key1)
      expect(blocked.allowed).toBe(false)
    })
  })

  describe('window reset', () => {
    it('resets after the window expires', async () => {
      vi.useFakeTimers()
      const key = 'test-ip-reset-window-' + Math.random()

      // Use up all requests
      for (let i = 0; i < 5; i++) {
        await authRateLimiter.check(key)
      }

      // Should be blocked
      expect((await authRateLimiter.check(key)).allowed).toBe(false)

      // Advance time past the window (60 seconds)
      vi.advanceTimersByTime(61_000)

      // Should be allowed again
      const result = await authRateLimiter.check(key)
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(4)

      vi.useRealTimers()
    })
  })
})
