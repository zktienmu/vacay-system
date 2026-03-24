import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { mockEmployee, mockLeaveRequest } from '@/__tests__/helpers/mocks'

// server-only is mocked via vitest.config.ts alias

// Session mock state
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

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({})),
}))

// Mock supabase queries
const mockGetEmployeeById = vi.fn()
const mockGetDelegatedLeaves = vi.fn()
const mockInsertAuditLog = vi.fn(() => Promise.resolve())

vi.mock('@/lib/supabase/queries', () => ({
  getEmployeeById: (...args: unknown[]) => mockGetEmployeeById(...args),
  getDelegatedLeaves: (...args: unknown[]) => mockGetDelegatedLeaves(...args),
  insertAuditLog: (...args: unknown[]) => mockInsertAuditLog(...args),
}))

describe('GET /api/leave/delegated', () => {
  let GET: (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>

  beforeEach(async () => {
    vi.clearAllMocks()
    mockSessionData = {
      employee_id: 'emp-001',
      wallet_address: '0xabc',
      name: 'Test User',
      role: 'employee',
      department: 'engineering',
      is_manager: false,
    }
    // withAuth middleware re-validates role from DB
    mockGetEmployeeById.mockImplementation((id: string) => {
      if (id === 'emp-001') return Promise.resolve(mockEmployee({ id: 'emp-001', role: 'employee', name: 'Test User' }))
      return Promise.resolve(null)
    })
    mockGetDelegatedLeaves.mockResolvedValue([])

    const mod = await import('@/app/api/leave/delegated/route')
    GET = mod.GET
  })

  it('returns 401 when not authenticated', async () => {
    mockSessionData = { employee_id: '' }
    const req = new NextRequest('http://localhost/api/leave/delegated')
    const res = await GET(req, { params: Promise.resolve({}) })
    const json = await res.json()

    expect(res.status).toBe(401)
    expect(json.success).toBe(false)
  })

  it('returns empty list when no delegated leaves', async () => {
    mockGetDelegatedLeaves.mockResolvedValue([])

    const req = new NextRequest('http://localhost/api/leave/delegated')
    const res = await GET(req, { params: Promise.resolve({}) })
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data).toHaveLength(0)
    expect(mockGetDelegatedLeaves).toHaveBeenCalledWith('emp-001')
  })

  it('returns delegated leaves with enriched employee data', async () => {
    const leave = mockLeaveRequest({ employee_id: 'emp-002' })
    mockGetDelegatedLeaves.mockResolvedValue([leave])
    mockGetEmployeeById.mockImplementation((id: string) => {
      if (id === 'emp-001') return Promise.resolve(mockEmployee({ id: 'emp-001', name: 'Test User' }))
      if (id === 'emp-002') return Promise.resolve(mockEmployee({ id: 'emp-002', name: 'Alice' }))
      return Promise.resolve(null)
    })

    const req = new NextRequest('http://localhost/api/leave/delegated')
    const res = await GET(req, { params: Promise.resolve({}) })
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data).toHaveLength(1)
    expect(json.data[0].employee).toEqual({ id: 'emp-002', name: 'Alice' })
  })

  it('returns null employee when requester not found', async () => {
    const leave = mockLeaveRequest({ employee_id: 'emp-deleted' })
    mockGetDelegatedLeaves.mockResolvedValue([leave])
    // emp-deleted not found in mockGetEmployeeById

    const req = new NextRequest('http://localhost/api/leave/delegated')
    const res = await GET(req, { params: Promise.resolve({}) })
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data[0].employee).toBeNull()
  })

  it('returns 500 when getDelegatedLeaves throws', async () => {
    mockGetDelegatedLeaves.mockRejectedValue(new Error('DB error'))

    const req = new NextRequest('http://localhost/api/leave/delegated')
    const res = await GET(req, { params: Promise.resolve({}) })
    const json = await res.json()

    expect(res.status).toBe(500)
    expect(json.error).toContain('Failed to fetch delegated leaves')
  })
})
