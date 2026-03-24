import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

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

// Build a chainable supabase query mock that resolves when awaited
let mockQueryResult: { data: unknown[] | null; error: { message: string } | null } = { data: [], error: null }

function createChainableQuery() {
  const chain: Record<string, unknown> = {}

  // Every method returns the chain, making it chainable
  const methods = ['select', 'eq', 'lte', 'gte', 'from']
  for (const method of methods) {
    chain[method] = vi.fn(() => chain)
  }

  // Make the chain thenable so it resolves when awaited
  chain.then = (resolve: (val: unknown) => void, reject?: (err: unknown) => void) => {
    try {
      resolve(mockQueryResult)
    } catch (e) {
      if (reject) reject(e)
    }
  }

  return chain
}

let mockChain = createChainableQuery()

vi.mock('@/lib/supabase/client', () => ({
  supabase: new Proxy({}, {
    get(_, prop) {
      if (prop === 'from') return () => mockChain
      return undefined
    },
  }),
  getSupabase: vi.fn(() => ({
    from: () => mockChain,
  })),
}))

// Mock the auth session module
vi.mock('@/lib/auth/session', () => ({
  sessionOptions: {
    cookieName: 'vaca_session',
    password: 'test-session-secret-at-least-32-chars-long!',
    cookieOptions: { secure: false },
  },
}))

// Mock slack format and google calendar helpers
vi.mock('@/lib/slack/format', () => ({
  formatLeaveType: vi.fn((type: string) => type.charAt(0).toUpperCase() + type.slice(1)),
}))

vi.mock('@/lib/google/calendar', () => ({
  getLeaveTypeEmoji: vi.fn(() => '📅'),
}))

describe('GET /api/calendar', () => {
  let GET: (req: NextRequest) => Promise<Response>

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

    mockQueryResult = { data: [], error: null }
    mockChain = createChainableQuery()

    const mod = await import('@/app/api/calendar/route')
    GET = mod.GET
  })

  it('returns 401 when not authenticated', async () => {
    mockSessionData = { employee_id: '' }

    const req = new NextRequest('http://localhost/api/calendar')
    const res = await GET(req)
    const json = await res.json()

    expect(res.status).toBe(401)
    expect(json.success).toBe(false)
  })

  it('returns calendar events for authenticated employee', async () => {
    const leaveData = [
      {
        id: 'lr-001',
        employee_id: 'emp-001',
        leave_type: 'annual',
        start_date: '2026-03-10',
        end_date: '2026-03-12',
        days: 3,
        status: 'approved',
        employees: { name: 'Test User', department: 'engineering' },
      },
    ]
    mockQueryResult = { data: leaveData, error: null }

    const req = new NextRequest('http://localhost/api/calendar?month=2026-03')
    const res = await GET(req)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data).toHaveLength(1)
    expect(json.data[0].title).toContain('Test User')
    // FullCalendar end is exclusive (add 1 day from 2026-03-12)
    expect(json.data[0].end).toBe('2026-03-13')
    expect(json.data[0].allDay).toBe(true)
    expect(json.data[0].color).toBe('#3B82F6') // annual leave color
  })

  it('returns empty events when no approved leaves', async () => {
    mockQueryResult = { data: [], error: null }

    const req = new NextRequest('http://localhost/api/calendar?month=2026-03')
    const res = await GET(req)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data).toHaveLength(0)
  })

  it('uses current month when no month param specified', async () => {
    mockQueryResult = { data: [], error: null }

    const req = new NextRequest('http://localhost/api/calendar')
    const res = await GET(req)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
  })

  it('returns 500 when supabase query fails', async () => {
    mockQueryResult = { data: null, error: { message: 'DB error' } }

    const req = new NextRequest('http://localhost/api/calendar?month=2026-03')
    const res = await GET(req)
    const json = await res.json()

    expect(res.status).toBe(500)
    expect(json.error).toContain('Failed to fetch calendar events')
  })

  it('admin sees all leaves without employee_id filter', async () => {
    mockSessionData = {
      employee_id: 'admin-001',
      wallet_address: '0xadmin',
      name: 'Admin User',
      role: 'admin',
      department: 'admin',
      is_manager: false,
    }

    const leaveData = [
      {
        id: 'lr-001',
        employee_id: 'emp-001',
        leave_type: 'annual',
        start_date: '2026-03-10',
        end_date: '2026-03-12',
        days: 3,
        status: 'approved',
        employees: { name: 'Alice', department: 'engineering' },
      },
      {
        id: 'lr-002',
        employee_id: 'emp-002',
        leave_type: 'sick',
        start_date: '2026-03-15',
        end_date: '2026-03-15',
        days: 1,
        status: 'approved',
        employees: { name: 'Bob', department: 'admin' },
      },
    ]
    mockQueryResult = { data: leaveData, error: null }

    const req = new NextRequest('http://localhost/api/calendar?month=2026-03')
    const res = await GET(req)
    const result = await res.json()

    expect(res.status).toBe(200)
    expect(result.data).toHaveLength(2)
  })

  it('manager sees all leaves (not just own department)', async () => {
    mockSessionData = {
      employee_id: 'mgr-001',
      wallet_address: '0xmgr',
      name: 'Manager User',
      role: 'employee',
      department: 'engineering',
      is_manager: true,
    }

    const leaveData = [
      {
        id: 'lr-001',
        employee_id: 'emp-001',
        leave_type: 'annual',
        start_date: '2026-03-10',
        end_date: '2026-03-12',
        days: 3,
        status: 'approved',
        employees: { name: 'Alice', department: 'engineering' },
      },
      {
        id: 'lr-002',
        employee_id: 'emp-002',
        leave_type: 'sick',
        start_date: '2026-03-15',
        end_date: '2026-03-15',
        days: 1,
        status: 'approved',
        employees: { name: 'Bob', department: 'admin' },
      },
    ]
    mockQueryResult = { data: leaveData, error: null }

    const req = new NextRequest('http://localhost/api/calendar?month=2026-03')
    const res = await GET(req)
    const result = await res.json()

    expect(res.status).toBe(200)
    // All employees see all leaves on the calendar
    expect(result.data).toHaveLength(2)
  })

  it('handles null data gracefully', async () => {
    mockQueryResult = { data: null, error: null }

    const req = new NextRequest('http://localhost/api/calendar?month=2026-03')
    const res = await GET(req)
    const json = await res.json()

    // data: null without error still returns ok — code uses `requests ?? []`
    expect(res.status).toBe(200)
    expect(json.data).toHaveLength(0)
  })
})
