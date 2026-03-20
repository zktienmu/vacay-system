import { describe, it, expect, vi, beforeEach } from 'vitest'
import { authRateLimiter, apiRateLimiter, getClientIp } from '@/lib/security/rate-limit'

describe('getClientIp', () => {
  it('extracts IP from x-forwarded-for header', () => {
    const req = new Request('http://localhost', {
      headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
    })
    expect(getClientIp(req)).toBe('1.2.3.4')
  })

  it('returns single IP from x-forwarded-for', () => {
    const req = new Request('http://localhost', {
      headers: { 'x-forwarded-for': '10.0.0.1' },
    })
    expect(getClientIp(req)).toBe('10.0.0.1')
  })

  it('trims whitespace from forwarded IP', () => {
    const req = new Request('http://localhost', {
      headers: { 'x-forwarded-for': '  1.2.3.4  , 5.6.7.8' },
    })
    expect(getClientIp(req)).toBe('1.2.3.4')
  })

  it('falls back to 127.0.0.1 when no forwarded header', () => {
    const req = new Request('http://localhost')
    expect(getClientIp(req)).toBe('127.0.0.1')
  })
})

describe('authRateLimiter (5 requests per 60 seconds)', () => {
  it('allows the first request', () => {
    const result = authRateLimiter.check('test-ip-auth-first')
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(4) // 5 - 1
  })

  it('allows up to 5 requests', () => {
    const key = 'test-ip-auth-5-' + Math.random()
    for (let i = 0; i < 5; i++) {
      const result = authRateLimiter.check(key)
      expect(result.allowed).toBe(true)
    }
  })

  it('blocks the 6th request', () => {
    const key = 'test-ip-auth-6-' + Math.random()
    for (let i = 0; i < 5; i++) {
      authRateLimiter.check(key)
    }
    const result = authRateLimiter.check(key)
    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
  })

  it('tracks remaining count correctly', () => {
    const key = 'test-ip-remaining-' + Math.random()
    expect(authRateLimiter.check(key).remaining).toBe(4)
    expect(authRateLimiter.check(key).remaining).toBe(3)
    expect(authRateLimiter.check(key).remaining).toBe(2)
    expect(authRateLimiter.check(key).remaining).toBe(1)
    expect(authRateLimiter.check(key).remaining).toBe(0)
  })

  it('provides a resetAt timestamp in the future', () => {
    const now = Date.now()
    const result = authRateLimiter.check('test-ip-reset-' + Math.random())
    expect(result.resetAt).toBeGreaterThan(now)
  })
})

describe('apiRateLimiter (60 requests per 60 seconds)', () => {
  it('allows the first request', () => {
    const result = apiRateLimiter.check('api-test-1-' + Math.random())
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(59) // 60 - 1
  })

  it('allows up to 60 requests', () => {
    const key = 'api-test-60-' + Math.random()
    for (let i = 0; i < 60; i++) {
      const result = apiRateLimiter.check(key)
      expect(result.allowed).toBe(true)
    }
  })

  it('blocks the 61st request', () => {
    const key = 'api-test-61-' + Math.random()
    for (let i = 0; i < 60; i++) {
      apiRateLimiter.check(key)
    }
    const result = apiRateLimiter.check(key)
    expect(result.allowed).toBe(false)
  })
})

describe('isolation between keys', () => {
  it('tracks different keys independently', () => {
    const suffix = Math.random()
    const key1 = 'ip-a-' + suffix
    const key2 = 'ip-b-' + suffix

    // Exhaust key1
    for (let i = 0; i < 5; i++) {
      authRateLimiter.check(key1)
    }

    // key2 should still be allowed
    const result = authRateLimiter.check(key2)
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(4)

    // key1 should be blocked
    const blocked = authRateLimiter.check(key1)
    expect(blocked.allowed).toBe(false)
  })
})

describe('window reset', () => {
  it('resets after the window expires', () => {
    vi.useFakeTimers()
    const key = 'test-ip-reset-window-' + Math.random()

    // Use up all requests
    for (let i = 0; i < 5; i++) {
      authRateLimiter.check(key)
    }

    // Should be blocked
    expect(authRateLimiter.check(key).allowed).toBe(false)

    // Advance time past the window (60 seconds)
    vi.advanceTimersByTime(61_000)

    // Should be allowed again
    const result = authRateLimiter.check(key)
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(4)

    vi.useRealTimers()
  })
})
