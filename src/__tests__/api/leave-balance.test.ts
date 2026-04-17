import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { mockEmployee } from '@/__tests__/helpers/mocks'

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
const mockInsertAuditLog = vi.fn(() => Promise.resolve())

vi.mock('@/lib/supabase/queries', () => ({
  getEmployeeById: (...args: unknown[]) => mockGetEmployeeById(...args),
  insertAuditLog: (...args: unknown[]) => mockInsertAuditLog(...args),
}))

// Mock leave balance
const mockGetLeaveBalance = vi.fn()

vi.mock('@/lib/leave/balance', () => ({
  getLeaveBalance: (...args: unknown[]) => mockGetLeaveBalance(...args),
}))

describe('GET /api/leave/balance', () => {
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
      if (id === 'admin-001') return Promise.resolve(mockEmployee({ id: 'admin-001', role: 'admin', name: 'Admin User' }))
      return Promise.resolve(null)
    })
    mockGetLeaveBalance.mockResolvedValue({
      leave_type: 'annual',
      total_days: 20,
      used_days: 5,
      remaining_days: 15,
    })

    const mod = await import('@/app/api/leave/balance/route')
    GET = mod.GET
  })

  it('returns 401 when not authenticated', async () => {
    mockSessionData = { employee_id: '' }
    const req = new NextRequest('http://localhost/api/leave/balance')
    const res = await GET(req, { params: Promise.resolve({}) })
    const json = await res.json()

    expect(res.status).toBe(401)
    expect(json.success).toBe(false)
  })

  it('returns leave balances for authenticated employee', async () => {
    const req = new NextRequest('http://localhost/api/leave/balance')
    const res = await GET(req, { params: Promise.resolve({}) })
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    // Should return 6 balance entries (one per leave type)
    expect(json.data).toHaveLength(6)
    expect(mockGetLeaveBalance).toHaveBeenCalledTimes(6)
    // First call should be with the session employee_id
    expect(mockGetLeaveBalance).toHaveBeenCalledWith('emp-001', 'annual', expect.any(String), null, null)
  })

  it('admin can query another employee balance', async () => {
    mockSessionData = {
      employee_id: 'admin-001',
      wallet_address: '0xadmin',
      name: 'Admin User',
      role: 'admin',
      department: 'admin',
      is_manager: false,
    }

    const targetEmployee = mockEmployee({ id: '550e8400-e29b-41d4-a716-446655440000', start_date: '2024-06-01' })
    mockGetEmployeeById.mockImplementation((id: string) => {
      if (id === 'admin-001') return Promise.resolve(mockEmployee({ id: 'admin-001', role: 'admin' }))
      if (id === '550e8400-e29b-41d4-a716-446655440000') return Promise.resolve(targetEmployee)
      return Promise.resolve(null)
    })

    const req = new NextRequest('http://localhost/api/leave/balance?employee_id=550e8400-e29b-41d4-a716-446655440000')
    const res = await GET(req, { params: Promise.resolve({}) })
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(mockGetLeaveBalance).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000', 'annual', '2024-06-01', null, null)
  })

  it('non-admin cannot query another employee balance', async () => {
    const req = new NextRequest('http://localhost/api/leave/balance?employee_id=550e8400-e29b-41d4-a716-446655440000')
    const res = await GET(req, { params: Promise.resolve({}) })
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    // Should use session employee_id, not the query param
    expect(mockGetLeaveBalance).toHaveBeenCalledWith('emp-001', expect.any(String), expect.any(String), null, null)
  })

  it('returns 400 for invalid employee_id format', async () => {
    mockSessionData = {
      employee_id: 'admin-001',
      wallet_address: '0xadmin',
      name: 'Admin User',
      role: 'admin',
      department: 'admin',
      is_manager: false,
    }

    const req = new NextRequest('http://localhost/api/leave/balance?employee_id=bad-id')
    const res = await GET(req, { params: Promise.resolve({}) })
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toContain('Invalid employee ID')
  })

  it('returns 404 when target employee not found', async () => {
    mockSessionData = {
      employee_id: 'admin-001',
      wallet_address: '0xadmin',
      name: 'Admin User',
      role: 'admin',
      department: 'admin',
      is_manager: false,
    }

    mockGetEmployeeById.mockImplementation((id: string) => {
      if (id === 'admin-001') return Promise.resolve(mockEmployee({ id: 'admin-001', role: 'admin' }))
      return Promise.resolve(null)
    })

    const req = new NextRequest('http://localhost/api/leave/balance?employee_id=550e8400-e29b-41d4-a716-446655440000')
    const res = await GET(req, { params: Promise.resolve({}) })
    const json = await res.json()

    expect(res.status).toBe(404)
    expect(json.error).toContain('Employee not found')
  })

  it('returns 500 when getLeaveBalance throws', async () => {
    mockGetLeaveBalance.mockRejectedValue(new Error('DB error'))

    const req = new NextRequest('http://localhost/api/leave/balance')
    const res = await GET(req, { params: Promise.resolve({}) })
    const json = await res.json()

    expect(res.status).toBe(500)
    expect(json.error).toContain('Failed to fetch leave balances')
  })
})
