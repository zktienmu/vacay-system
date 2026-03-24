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
const mockGetAllEmployees = vi.fn()
const mockGetEmployeeById = vi.fn()
const mockInsertAuditLog = vi.fn(() => Promise.resolve())

vi.mock('@/lib/supabase/queries', () => ({
  getAllEmployees: (...args: unknown[]) => mockGetAllEmployees(...args),
  getEmployeeById: (...args: unknown[]) => mockGetEmployeeById(...args),
  insertAuditLog: (...args: unknown[]) => mockInsertAuditLog(...args),
}))

describe('GET /api/employees/list', () => {
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
    mockGetAllEmployees.mockResolvedValue([])

    const mod = await import('@/app/api/employees/list/route')
    GET = mod.GET
  })

  it('returns 401 when not authenticated', async () => {
    mockSessionData = { employee_id: '' }

    const req = new NextRequest('http://localhost/api/employees/list')
    const res = await GET(req, { params: Promise.resolve({}) })
    const json = await res.json()

    expect(res.status).toBe(401)
    expect(json.success).toBe(false)
  })

  it('returns lightweight employee list for any authenticated user', async () => {
    const employees = [
      mockEmployee({ id: 'e1', name: 'Alice', wallet_address: '0xaaa' }),
      mockEmployee({ id: 'e2', name: 'Bob', wallet_address: '0xbbb' }),
    ]
    mockGetAllEmployees.mockResolvedValue(employees)

    const req = new NextRequest('http://localhost/api/employees/list')
    const res = await GET(req, { params: Promise.resolve({}) })
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data).toHaveLength(2)
    // Should only return id and name (lightweight)
    expect(json.data[0]).toEqual({ id: 'e1', name: 'Alice' })
    expect(json.data[1]).toEqual({ id: 'e2', name: 'Bob' })
  })

  it('does not expose sensitive employee fields', async () => {
    const employees = [mockEmployee({ id: 'e1', name: 'Alice', wallet_address: '0xaaa', slack_user_id: 'U123' })]
    mockGetAllEmployees.mockResolvedValue(employees)

    const req = new NextRequest('http://localhost/api/employees/list')
    const res = await GET(req, { params: Promise.resolve({}) })
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.data[0]).not.toHaveProperty('wallet_address')
    expect(json.data[0]).not.toHaveProperty('slack_user_id')
    expect(json.data[0]).not.toHaveProperty('role')
    expect(json.data[0]).not.toHaveProperty('start_date')
  })

  it('returns empty list when no employees', async () => {
    mockGetAllEmployees.mockResolvedValue([])

    const req = new NextRequest('http://localhost/api/employees/list')
    const res = await GET(req, { params: Promise.resolve({}) })
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data).toHaveLength(0)
  })

  it('returns 500 when getAllEmployees throws', async () => {
    mockGetAllEmployees.mockRejectedValue(new Error('DB error'))

    const req = new NextRequest('http://localhost/api/employees/list')
    const res = await GET(req, { params: Promise.resolve({}) })
    const json = await res.json()

    expect(res.status).toBe(500)
    expect(json.error).toContain('Failed to fetch employees')
  })
})
