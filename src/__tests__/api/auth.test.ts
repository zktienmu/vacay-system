import { describe, it, expect, vi, beforeEach } from 'vitest'

// server-only is mocked via vitest.config.ts alias

// Mock iron-session
const mockSave = vi.fn()
const mockDestroy = vi.fn()
let mockSessionData: Record<string, unknown> = {}

vi.mock('iron-session', () => ({
  getIronSession: vi.fn(() =>
    Promise.resolve(
      new Proxy(mockSessionData, {
        get(target, prop) {
          if (prop === 'save') return mockSave
          if (prop === 'destroy') return mockDestroy
          return target[prop as string]
        },
        set(target, prop, value) {
          target[prop as string] = value
          return true
        },
      }),
    ),
  ),
}))

// Mock next/headers
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({})),
}))

// Mock SIWE
vi.mock('@/lib/auth/siwe', () => ({
  generateNonce: vi.fn(() => 'test-nonce-123'),
  verifySiweMessage: vi.fn(),
}))

// Mock supabase queries
vi.mock('@/lib/supabase/queries', () => ({
  getEmployeeByWallet: vi.fn(),
  getEmployeeById: vi.fn(),
  insertAuditLog: vi.fn(() => Promise.resolve()),
}))

// Mock rate limiter
vi.mock('@/lib/security/rate-limit', () => ({
  authRateLimiter: {
    check: vi.fn(() => ({ allowed: true, remaining: 4, resetAt: Date.now() + 60000 })),
  },
  apiRateLimiter: {
    check: vi.fn(() => ({ allowed: true, remaining: 59, resetAt: Date.now() + 60000 })),
  },
  getClientIp: vi.fn(() => '127.0.0.1'),
}))

import { NextRequest } from 'next/server'
import { verifySiweMessage } from '@/lib/auth/siwe'
import { getEmployeeByWallet } from '@/lib/supabase/queries'
import { authRateLimiter } from '@/lib/security/rate-limit'
import { mockEmployee } from '@/__tests__/helpers/mocks'

describe('GET /api/auth/nonce', () => {
  let GET: (req: NextRequest) => Promise<Response>

  beforeEach(async () => {
    vi.clearAllMocks()
    mockSessionData = {}
    const mod = await import('@/app/api/auth/nonce/route')
    GET = mod.GET
  })

  it('returns a nonce on success', async () => {
    const req = new NextRequest('http://localhost/api/auth/nonce')
    const res = await GET(req)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data.nonce).toBe('test-nonce-123')
  })

  it('saves the nonce to the session', async () => {
    const req = new NextRequest('http://localhost/api/auth/nonce')
    await GET(req)

    expect(mockSave).toHaveBeenCalled()
    expect(mockSessionData.nonce).toBe('test-nonce-123')
    expect(mockSessionData.nonce_issued_at).toBeDefined()
  })

  it('returns 429 when rate limited', async () => {
    vi.mocked(authRateLimiter.check).mockReturnValueOnce({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 60000,
    })

    const req = new NextRequest('http://localhost/api/auth/nonce')
    const res = await GET(req)
    const json = await res.json()

    expect(res.status).toBe(429)
    expect(json.success).toBe(false)
    expect(json.error).toContain('Too many requests')
  })
})

describe('POST /api/auth/verify', () => {
  let POST: (req: NextRequest) => Promise<Response>

  beforeEach(async () => {
    vi.clearAllMocks()
    mockSessionData = {
      nonce: 'valid-nonce',
      nonce_issued_at: Date.now(),
    }
    vi.resetModules()

    // Re-mock modules for fresh import
    // server-only handled by alias
    vi.doMock('iron-session', () => ({
      getIronSession: vi.fn(() =>
        Promise.resolve(
          new Proxy(mockSessionData, {
            get(target, prop) {
              if (prop === 'save') return mockSave
              if (prop === 'destroy') return mockDestroy
              return target[prop as string]
            },
            set(target, prop, value) {
              target[prop as string] = value
              return true
            },
          }),
        ),
      ),
    }))
    vi.doMock('next/headers', () => ({
      cookies: vi.fn(() => Promise.resolve({})),
    }))
    vi.doMock('@/lib/auth/siwe', () => ({
      generateNonce: vi.fn(() => 'test-nonce-123'),
      verifySiweMessage: vi.fn(),
    }))
    vi.doMock('@/lib/supabase/queries', () => ({
      getEmployeeByWallet: vi.fn(),
      getEmployeeById: vi.fn(() => Promise.resolve(null)),
      insertAuditLog: vi.fn(() => Promise.resolve()),
    }))
    vi.doMock('@/lib/security/rate-limit', () => ({
      authRateLimiter: {
        check: vi.fn(() => ({ allowed: true, remaining: 4, resetAt: Date.now() + 60000 })),
      },
      apiRateLimiter: {
        check: vi.fn(() => ({ allowed: true, remaining: 59, resetAt: Date.now() + 60000 })),
      },
      getClientIp: vi.fn(() => '127.0.0.1'),
    }))

    const mod = await import('@/app/api/auth/verify/route')
    POST = mod.POST
  })

  it('returns 400 with invalid request body', async () => {
    const req = new NextRequest('http://localhost/api/auth/verify', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.success).toBe(false)
  })

  it('returns 400 when no nonce exists in session', async () => {
    mockSessionData = {} // No nonce

    const req = new NextRequest('http://localhost/api/auth/verify', {
      method: 'POST',
      body: JSON.stringify({
        message: 'Sign in to Vaca',
        signature: '0xsig',
      }),
    })
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toContain('nonce')
  })

  it('returns 400 when nonce has expired', async () => {
    // Set nonce_issued_at to more than 5 minutes ago
    mockSessionData = {
      nonce: 'expired-nonce',
      nonce_issued_at: Date.now() - 6 * 60 * 1000,
    }

    const req = new NextRequest('http://localhost/api/auth/verify', {
      method: 'POST',
      body: JSON.stringify({
        message: 'Sign in to Vaca',
        signature: '0xsig',
      }),
    })
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toContain('expired')
  })

  it('returns 400 when SIWE verification fails', async () => {
    const { verifySiweMessage: mockVerify } = await import('@/lib/auth/siwe')
    vi.mocked(mockVerify).mockRejectedValueOnce(new Error('Invalid signature'))

    const req = new NextRequest('http://localhost/api/auth/verify', {
      method: 'POST',
      body: JSON.stringify({
        message: 'Sign in to Vaca',
        signature: '0xbadsig',
      }),
    })
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toContain('verification failed')
  })

  it('returns 403 when wallet is not registered', async () => {
    const { verifySiweMessage: mockVerify } = await import('@/lib/auth/siwe')
    vi.mocked(mockVerify).mockResolvedValueOnce('0x1234567890abcdef1234567890abcdef12345678')

    const { getEmployeeByWallet: mockGetEmployee } = await import('@/lib/supabase/queries')
    vi.mocked(mockGetEmployee).mockResolvedValueOnce(null)

    const req = new NextRequest('http://localhost/api/auth/verify', {
      method: 'POST',
      body: JSON.stringify({
        message: 'Sign in to Vaca',
        signature: '0xvalidsig',
      }),
    })
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(403)
    expect(json.error).toContain('Not registered')
  })

  it('returns session data on successful verification', async () => {
    const employee = mockEmployee({
      id: 'emp-42',
      wallet_address: '0x1234567890abcdef1234567890abcdef12345678',
      name: 'Alice',
      role: 'admin',
    })

    const { verifySiweMessage: mockVerify } = await import('@/lib/auth/siwe')
    vi.mocked(mockVerify).mockResolvedValueOnce(employee.wallet_address)

    const { getEmployeeByWallet: mockGetEmployee } = await import('@/lib/supabase/queries')
    vi.mocked(mockGetEmployee).mockResolvedValueOnce(employee)

    const req = new NextRequest('http://localhost/api/auth/verify', {
      method: 'POST',
      body: JSON.stringify({
        message: 'Sign in to Vaca',
        signature: '0xvalidsig',
      }),
    })
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data.employee_id).toBe('emp-42')
    expect(json.data.name).toBe('Alice')
    expect(json.data.role).toBe('admin')
  })

  it('returns 429 when rate limited', async () => {
    const { authRateLimiter: mockLimiter } = await import('@/lib/security/rate-limit')
    vi.mocked(mockLimiter.check).mockReturnValueOnce({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 60000,
    })

    const req = new NextRequest('http://localhost/api/auth/verify', {
      method: 'POST',
      body: JSON.stringify({
        message: 'Sign in',
        signature: '0xsig',
      }),
    })
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(429)
    expect(json.error).toContain('Too many requests')
  })
})

describe('GET /api/auth/me', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    mockSessionData = { employee_id: '' }

    vi.resetModules()
    // server-only handled by alias
    vi.doMock('iron-session', () => ({
      getIronSession: vi.fn(() =>
        Promise.resolve(
          new Proxy(mockSessionData, {
            get(target, prop) {
              if (prop === 'save') return mockSave
              if (prop === 'destroy') return mockDestroy
              return target[prop as string]
            },
            set(target, prop, value) {
              target[prop as string] = value
              return true
            },
          }),
        ),
      ),
    }))
    vi.doMock('next/headers', () => ({
      cookies: vi.fn(() => Promise.resolve({})),
    }))
    vi.doMock('@/lib/supabase/queries', () => ({
      getEmployeeByWallet: vi.fn(),
      getEmployeeById: vi.fn(() => Promise.resolve(null)),
      insertAuditLog: vi.fn(() => Promise.resolve()),
    }))

    const mod = await import('@/app/api/auth/me/route')
    const req = new NextRequest('http://localhost/api/auth/me')
    const res = await mod.GET(req, { params: Promise.resolve({}) })
    const json = await res.json()

    expect(res.status).toBe(401)
    expect(json.success).toBe(false)
    expect(json.error).toBe('Unauthorized')
  })

  it('returns session data when authenticated', async () => {
    mockSessionData = {
      employee_id: 'emp-001',
      wallet_address: '0xabc',
      name: 'Test User',
      role: 'employee',
    }

    vi.resetModules()
    // server-only handled by alias
    vi.doMock('iron-session', () => ({
      getIronSession: vi.fn(() =>
        Promise.resolve(
          new Proxy(mockSessionData, {
            get(target, prop) {
              if (prop === 'save') return mockSave
              if (prop === 'destroy') return mockDestroy
              return target[prop as string]
            },
            set(target, prop, value) {
              target[prop as string] = value
              return true
            },
          }),
        ),
      ),
    }))
    vi.doMock('next/headers', () => ({
      cookies: vi.fn(() => Promise.resolve({})),
    }))
    vi.doMock('@/lib/supabase/queries', () => ({
      getEmployeeByWallet: vi.fn(),
      getEmployeeById: vi.fn(() => Promise.resolve({
        id: 'emp-001',
        wallet_address: '0xabc',
        name: 'Test User',
        role: 'employee',
        slack_user_id: null,
        start_date: '2024-01-01',
        created_at: '',
        updated_at: '',
      })),
      insertAuditLog: vi.fn(() => Promise.resolve()),
    }))

    const mod = await import('@/app/api/auth/me/route')
    const req = new NextRequest('http://localhost/api/auth/me')
    const res = await mod.GET(req, { params: Promise.resolve({}) })
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data.employee_id).toBe('emp-001')
    expect(json.data.name).toBe('Test User')
    expect(json.data.role).toBe('employee')
  })
})

describe('POST /api/auth/logout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('destroys the session and returns success', async () => {
    mockSessionData = { employee_id: 'emp-001' }

    vi.resetModules()
    // server-only handled by alias
    vi.doMock('iron-session', () => ({
      getIronSession: vi.fn(() =>
        Promise.resolve(
          new Proxy(mockSessionData, {
            get(target, prop) {
              if (prop === 'save') return mockSave
              if (prop === 'destroy') return mockDestroy
              return target[prop as string]
            },
            set(target, prop, value) {
              target[prop as string] = value
              return true
            },
          }),
        ),
      ),
    }))
    vi.doMock('next/headers', () => ({
      cookies: vi.fn(() => Promise.resolve({})),
    }))
    vi.doMock('@/lib/supabase/queries', () => ({
      getEmployeeById: vi.fn(() => Promise.resolve(null)),
      insertAuditLog: vi.fn(() => Promise.resolve()),
    }))
    vi.doMock('@/lib/security/rate-limit', () => ({
      getClientIp: vi.fn(() => '127.0.0.1'),
    }))

    const mod = await import('@/app/api/auth/logout/route')
    const req = new NextRequest('http://localhost/api/auth/logout', {
      method: 'POST',
    })
    const res = await mod.POST(req)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data).toBeNull()
    expect(mockDestroy).toHaveBeenCalled()
  })
})
