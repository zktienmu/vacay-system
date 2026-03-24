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

// Mock leave balance
const mockGetLeaveBalance = vi.fn()

vi.mock('@/lib/leave/balance', () => ({
  getLeaveBalance: (...args: unknown[]) => mockGetLeaveBalance(...args),
}))

// Mock jsPDF and autotable
vi.mock('jspdf', () => {
  function MockJsPDF() {
    // @ts-expect-error mock constructor
    this.setFontSize = vi.fn()
    // @ts-expect-error mock constructor
    this.text = vi.fn()
    // @ts-expect-error mock constructor
    this.output = vi.fn(() => new ArrayBuffer(100))
  }
  return { jsPDF: MockJsPDF }
})

vi.mock('jspdf-autotable', () => ({
  default: vi.fn(),
}))

describe('GET /api/reports/balance', () => {
  let GET: (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>

  beforeEach(async () => {
    vi.clearAllMocks()
    mockSessionData = {
      employee_id: 'admin-001',
      wallet_address: '0xadmin',
      name: 'Admin User',
      role: 'admin',
      department: 'admin',
      is_manager: false,
    }
    mockGetEmployeeById.mockImplementation((id: string) => {
      if (id === 'admin-001') return Promise.resolve(mockEmployee({ id: 'admin-001', role: 'admin', name: 'Admin User' }))
      if (id === 'emp-001') return Promise.resolve(mockEmployee({ id: 'emp-001', role: 'employee' }))
      return Promise.resolve(null)
    })
    mockGetAllEmployees.mockResolvedValue([])
    mockGetLeaveBalance.mockResolvedValue({
      leave_type: 'annual',
      total_days: 0,
      used_days: 0,
      remaining_days: 0,
    })

    const mod = await import('@/app/api/reports/balance/route')
    GET = mod.GET
  })

  it('returns 401 when not authenticated', async () => {
    mockSessionData = { employee_id: '' }

    const req = new NextRequest('http://localhost/api/reports/balance?format=csv')
    const res = await GET(req, { params: Promise.resolve({}) })
    const json = await res.json()

    expect(res.status).toBe(401)
    expect(json.success).toBe(false)
  })

  it('returns 403 for non-admin users', async () => {
    mockSessionData = {
      employee_id: 'emp-001',
      wallet_address: '0xabc',
      name: 'Test User',
      role: 'employee',
      department: 'engineering',
      is_manager: false,
    }

    const req = new NextRequest('http://localhost/api/reports/balance?format=csv')
    const res = await GET(req, { params: Promise.resolve({}) })
    const json = await res.json()

    expect(res.status).toBe(403)
    expect(json.error).toBe('Forbidden')
  })

  it('returns 400 when format parameter is missing', async () => {
    const req = new NextRequest('http://localhost/api/reports/balance')
    const res = await GET(req, { params: Promise.resolve({}) })
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.success).toBe(false)
  })

  it('returns 400 when format parameter is invalid', async () => {
    const req = new NextRequest('http://localhost/api/reports/balance?format=json')
    const res = await GET(req, { params: Promise.resolve({}) })
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.success).toBe(false)
  })

  it('returns CSV report with valid data', async () => {
    const employees = [
      mockEmployee({ id: 'e1', name: 'Alice', start_date: '2024-01-01' }),
    ]
    mockGetAllEmployees.mockResolvedValue(employees)
    mockGetLeaveBalance.mockImplementation((_id: string, type: string) => {
      if (type === 'annual') {
        return Promise.resolve({ leave_type: 'annual', total_days: 20, used_days: 5, remaining_days: 15 })
      }
      return Promise.resolve({ leave_type: type, total_days: 0, used_days: 0, remaining_days: 0 })
    })

    const req = new NextRequest('http://localhost/api/reports/balance?format=csv')
    const res = await GET(req, { params: Promise.resolve({}) })

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/csv')
    expect(res.headers.get('Content-Disposition')).toContain('balance-report.csv')

    const body = await res.text()
    // CSV should have header row
    expect(body).toContain('Employee Name')
    expect(body).toContain('Leave Type')
    expect(body).toContain('Entitled')
    expect(body).toContain('Used')
    expect(body).toContain('Remaining')
    // Should contain Alice's annual data
    expect(body).toContain('Alice')
    expect(body).toContain('annual')
  })

  it('returns PDF report', async () => {
    const employees = [
      mockEmployee({ id: 'e1', name: 'Alice', start_date: '2024-01-01' }),
    ]
    mockGetAllEmployees.mockResolvedValue(employees)
    mockGetLeaveBalance.mockResolvedValue({
      leave_type: 'annual',
      total_days: 20,
      used_days: 5,
      remaining_days: 15,
    })

    const req = new NextRequest('http://localhost/api/reports/balance?format=pdf')
    const res = await GET(req, { params: Promise.resolve({}) })

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/pdf')
    expect(res.headers.get('Content-Disposition')).toContain('balance-report.pdf')
  })

  it('only includes rows with policy or usage', async () => {
    const employees = [
      mockEmployee({ id: 'e1', name: 'Alice', start_date: '2024-01-01' }),
    ]
    mockGetAllEmployees.mockResolvedValue(employees)
    mockGetLeaveBalance.mockImplementation((_id: string, type: string) => {
      if (type === 'annual') {
        return Promise.resolve({ leave_type: 'annual', total_days: 20, used_days: 5, remaining_days: 15 })
      }
      // All other types have 0 total and 0 used — should be excluded
      return Promise.resolve({ leave_type: type, total_days: 0, used_days: 0, remaining_days: 0 })
    })

    const req = new NextRequest('http://localhost/api/reports/balance?format=csv')
    const res = await GET(req, { params: Promise.resolve({}) })
    const body = await res.text()

    // Count data rows (excluding header)
    const lines = body.trim().split('\n')
    expect(lines.length).toBe(2) // header + 1 data row (annual only)
  })

  it('returns empty CSV when no employees', async () => {
    mockGetAllEmployees.mockResolvedValue([])

    const req = new NextRequest('http://localhost/api/reports/balance?format=csv')
    const res = await GET(req, { params: Promise.resolve({}) })
    const body = await res.text()

    expect(res.status).toBe(200)
    // Should have header row only
    const lines = body.trim().split('\n')
    expect(lines.length).toBe(1)
  })

  it('returns 500 when getAllEmployees throws', async () => {
    mockGetAllEmployees.mockRejectedValue(new Error('DB error'))

    const req = new NextRequest('http://localhost/api/reports/balance?format=csv')
    const res = await GET(req, { params: Promise.resolve({}) })
    const json = await res.json()

    expect(res.status).toBe(500)
    expect(json.error).toContain('Failed to generate balance report')
  })
})
