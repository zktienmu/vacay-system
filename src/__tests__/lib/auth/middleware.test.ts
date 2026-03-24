import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { mockSession, mockEmployee } from '@/__tests__/helpers/mocks'

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

// Mock supabase queries
const mockGetEmployeeById = vi.fn()
vi.mock('@/lib/supabase/queries', () => ({
  getEmployeeById: (...args: unknown[]) => mockGetEmployeeById(...args),
}))

import { withAuth, clearAuthCache } from '@/lib/auth/middleware'

const dummyHandler = vi.fn(async (_req, _ctx, session) => {
  const { NextResponse } = await import('next/server')
  return NextResponse.json({ success: true, data: { role: session.role } })
})

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/test')
}

const dummyCtx = { params: Promise.resolve({}) }

describe('withAuth employee cache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearAuthCache()
    mockSessionData = {
      ...mockSession(),
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls getEmployeeById on first request (cache miss)', async () => {
    const employee = mockEmployee()
    mockGetEmployeeById.mockResolvedValueOnce(employee)

    const handler = withAuth(dummyHandler)
    const res = await handler(makeRequest(), dummyCtx)

    expect(res.status).toBe(200)
    expect(mockGetEmployeeById).toHaveBeenCalledTimes(1)
    expect(mockGetEmployeeById).toHaveBeenCalledWith('emp-001')
  })

  it('uses cached data on second request within TTL (no DB call)', async () => {
    const employee = mockEmployee()
    mockGetEmployeeById.mockResolvedValue(employee)

    const handler = withAuth(dummyHandler)

    // First call — should hit DB
    await handler(makeRequest(), dummyCtx)
    expect(mockGetEmployeeById).toHaveBeenCalledTimes(1)

    // Second call — should use cache
    await handler(makeRequest(), dummyCtx)
    expect(mockGetEmployeeById).toHaveBeenCalledTimes(1) // still 1
  })

  it('fetches from DB again after cache expires', async () => {
    const employee = mockEmployee()
    mockGetEmployeeById.mockResolvedValue(employee)

    const handler = withAuth(dummyHandler)

    // First call — hits DB, populates cache
    await handler(makeRequest(), dummyCtx)
    expect(mockGetEmployeeById).toHaveBeenCalledTimes(1)

    // Advance time past the 60s TTL
    vi.useFakeTimers()
    vi.advanceTimersByTime(61_000)

    // Third call — cache expired, should hit DB again
    await handler(makeRequest(), dummyCtx)
    expect(mockGetEmployeeById).toHaveBeenCalledTimes(2)

    vi.useRealTimers()
  })

  it('caches different employees independently', async () => {
    const emp1 = mockEmployee({ id: 'emp-001' })
    const emp2 = mockEmployee({ id: 'emp-002', name: 'User 2' })

    mockGetEmployeeById.mockImplementation((id: string) => {
      if (id === 'emp-001') return Promise.resolve(emp1)
      if (id === 'emp-002') return Promise.resolve(emp2)
      return Promise.resolve(null)
    })

    const handler = withAuth(dummyHandler)

    // First employee
    mockSessionData = { ...mockSession({ employee_id: 'emp-001' }) }
    await handler(makeRequest(), dummyCtx)

    // Second employee
    mockSessionData = { ...mockSession({ employee_id: 'emp-002' }) }
    await handler(makeRequest(), dummyCtx)

    expect(mockGetEmployeeById).toHaveBeenCalledTimes(2)
    expect(mockGetEmployeeById).toHaveBeenCalledWith('emp-001')
    expect(mockGetEmployeeById).toHaveBeenCalledWith('emp-002')

    // Both should be cached now — no more DB calls
    mockSessionData = { ...mockSession({ employee_id: 'emp-001' }) }
    await handler(makeRequest(), dummyCtx)
    mockSessionData = { ...mockSession({ employee_id: 'emp-002' }) }
    await handler(makeRequest(), dummyCtx)

    expect(mockGetEmployeeById).toHaveBeenCalledTimes(2) // still 2
  })

  it('clearAuthCache() forces a fresh DB lookup', async () => {
    const employee = mockEmployee()
    mockGetEmployeeById.mockResolvedValue(employee)

    const handler = withAuth(dummyHandler)

    // First call — populates cache
    await handler(makeRequest(), dummyCtx)
    expect(mockGetEmployeeById).toHaveBeenCalledTimes(1)

    // Clear cache
    clearAuthCache()

    // Next call — should hit DB again
    await handler(makeRequest(), dummyCtx)
    expect(mockGetEmployeeById).toHaveBeenCalledTimes(2)
  })

  it('syncs session when cached employee data differs from session', async () => {
    // Employee role changed in DB to admin, but session still says employee
    const employee = mockEmployee({ role: 'admin', department: 'admin' })
    mockGetEmployeeById.mockResolvedValueOnce(employee)

    mockSessionData = {
      ...mockSession({ role: 'employee', department: 'engineering' }),
    }

    const handler = withAuth(dummyHandler)
    await handler(makeRequest(), dummyCtx)

    // Session should be updated
    expect(mockSessionData.role).toBe('admin')
    expect(mockSessionData.department).toBe('admin')
    expect(mockSave).toHaveBeenCalled()
  })

  it('still syncs session on cache hit if session data drifts', async () => {
    // First request: employee and session match
    const employee = mockEmployee({ role: 'admin' })
    mockGetEmployeeById.mockResolvedValue(employee)

    mockSessionData = { ...mockSession({ role: 'admin' }) }
    const handler = withAuth(dummyHandler)
    await handler(makeRequest(), dummyCtx)
    expect(mockSave).not.toHaveBeenCalled() // no change needed

    // Second request: same cached employee, but session now says 'employee'
    // (e.g., different cookie/session for the same employee_id)
    mockSessionData = { ...mockSession({ role: 'employee' }) }
    await handler(makeRequest(), dummyCtx)

    // Cache was used (no new DB call)
    expect(mockGetEmployeeById).toHaveBeenCalledTimes(1)
    // But session was still synced
    expect(mockSessionData.role).toBe('admin')
    expect(mockSave).toHaveBeenCalled()
  })

  it('returns 401 and destroys session when employee not found (not cached)', async () => {
    mockGetEmployeeById.mockResolvedValueOnce(null)

    const handler = withAuth(dummyHandler)
    const res = await handler(makeRequest(), dummyCtx)
    const json = await res.json()

    expect(res.status).toBe(401)
    expect(json.error).toBe('Unauthorized')
    expect(mockDestroy).toHaveBeenCalled()
    expect(dummyHandler).not.toHaveBeenCalled()
  })

  it('does not cache null (deleted employee) results', async () => {
    mockGetEmployeeById.mockResolvedValueOnce(null)

    const handler = withAuth(dummyHandler)

    // First call — employee not found
    await handler(makeRequest(), dummyCtx)
    expect(mockGetEmployeeById).toHaveBeenCalledTimes(1)

    // If the employee is re-added, next call should still hit DB
    const employee = mockEmployee()
    mockGetEmployeeById.mockResolvedValueOnce(employee)

    await handler(makeRequest(), dummyCtx)
    expect(mockGetEmployeeById).toHaveBeenCalledTimes(2)
  })

  it('returns 401 when session has no employee_id', async () => {
    mockSessionData = { employee_id: '' }

    const handler = withAuth(dummyHandler)
    const res = await handler(makeRequest(), dummyCtx)
    const json = await res.json()

    expect(res.status).toBe(401)
    expect(json.error).toBe('Unauthorized')
    expect(mockGetEmployeeById).not.toHaveBeenCalled()
  })
})
