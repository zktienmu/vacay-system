import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { mockLeaveRequest, mockEmployee } from '@/__tests__/helpers/mocks'
import { clearAuthCache } from '@/lib/auth/middleware'

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
const mockGetLeaveRequests = vi.fn()
const mockCreateLeaveRequest = vi.fn()
const mockGetEmployeeById = vi.fn()
const mockInsertAuditLog = vi.fn(() => Promise.resolve())
const mockGetLeaveRequestById = vi.fn()
const mockUpdateLeaveRequest = vi.fn()
const mockGetLeavePolicies = vi.fn()
const mockGetApprovedDaysInPeriod = vi.fn()
const mockGetPublicHolidayDatesInRange = vi.fn()
const mockGetEmployeesByIds = vi.fn(() => Promise.resolve([]))

vi.mock('@/lib/supabase/queries', () => ({
  getLeaveRequests: (...args: unknown[]) => mockGetLeaveRequests(...args),
  createLeaveRequest: (...args: unknown[]) => mockCreateLeaveRequest(...args),
  getEmployeeById: (...args: unknown[]) => mockGetEmployeeById(...args),
  getEmployeesByIds: (...args: unknown[]) => mockGetEmployeesByIds(...args),
  insertAuditLog: (...args: unknown[]) => mockInsertAuditLog(...args),
  getLeaveRequestById: (...args: unknown[]) => mockGetLeaveRequestById(...args),
  updateLeaveRequest: (...args: unknown[]) => mockUpdateLeaveRequest(...args),
  getLeavePolicies: (...args: unknown[]) => mockGetLeavePolicies(...args),
  getApprovedDaysInPeriod: (...args: unknown[]) => mockGetApprovedDaysInPeriod(...args),
  getPublicHolidayDatesInRange: (...args: unknown[]) => mockGetPublicHolidayDatesInRange(...args),
}))

// Mock integrations
vi.mock('@/lib/integrations/hooks', () => ({
  onLeaveRequestCreated: vi.fn(() => Promise.resolve()),
  onLeaveRequestApproved: vi.fn(() => Promise.resolve()),
  onLeaveRequestRejected: vi.fn(() => Promise.resolve()),
  onLeaveRequestCancelled: vi.fn(() => Promise.resolve()),
}))

describe('GET /api/leave', () => {
  let GET: (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>

  beforeEach(async () => {
    vi.clearAllMocks()
    clearAuthCache()
    mockSessionData = {
      employee_id: 'emp-001',
      wallet_address: '0xabc',
      name: 'Test User',
      role: 'employee',
    }
    // withAuth middleware re-validates role from DB
    mockGetEmployeeById.mockImplementation((id: string) => {
      if (id === 'emp-001') return Promise.resolve(mockEmployee({ id: 'emp-001', role: 'employee', name: 'Test User' }))
      if (id === 'admin-001') return Promise.resolve(mockEmployee({ id: 'admin-001', role: 'admin', name: 'Admin User' }))
      return Promise.resolve(null)
    })
    const mod = await import('@/app/api/leave/route')
    GET = mod.GET
  })

  it('returns 401 when not authenticated', async () => {
    mockSessionData = { employee_id: '' }
    const req = new NextRequest('http://localhost/api/leave')
    const res = await GET(req, { params: Promise.resolve({}) })
    const json = await res.json()

    expect(res.status).toBe(401)
    expect(json.success).toBe(false)
  })

  it('returns leave requests for authenticated employee', async () => {
    const requests = [mockLeaveRequest()]
    mockGetLeaveRequests.mockResolvedValue(requests)

    const req = new NextRequest('http://localhost/api/leave')
    const res = await GET(req, { params: Promise.resolve({}) })
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data).toHaveLength(1)
    expect(mockGetLeaveRequests).toHaveBeenCalledWith(
      expect.objectContaining({ employee_id: 'emp-001' }),
    )
  })

  it('filters by status when provided', async () => {
    mockGetLeaveRequests.mockResolvedValue([])

    const req = new NextRequest('http://localhost/api/leave?status=pending')
    const res = await GET(req, { params: Promise.resolve({}) })

    expect(res.status).toBe(200)
    expect(mockGetLeaveRequests).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending' }),
    )
  })

  it('non-admin cannot view all requests', async () => {
    mockGetLeaveRequests.mockResolvedValue([])

    const req = new NextRequest('http://localhost/api/leave?all=true')
    const res = await GET(req, { params: Promise.resolve({}) })

    expect(res.status).toBe(200)
    // Should still filter by employee_id since role is 'employee'
    expect(mockGetLeaveRequests).toHaveBeenCalledWith(
      expect.objectContaining({ employee_id: 'emp-001' }),
    )
  })

  it('admin can view all requests', async () => {
    mockSessionData.role = 'admin'
    // Middleware re-validates role from DB — return admin role for this user
    mockGetEmployeeById.mockImplementation((id: string) => {
      if (id === 'emp-001') return Promise.resolve(mockEmployee({ id: 'emp-001', role: 'admin', name: 'Test User' }))
      return Promise.resolve(null)
    })
    mockGetLeaveRequests.mockResolvedValue([])

    const req = new NextRequest('http://localhost/api/leave?all=true')
    const res = await GET(req, { params: Promise.resolve({}) })

    expect(res.status).toBe(200)
    // Should NOT filter by employee_id when admin requests all
    expect(mockGetLeaveRequests).toHaveBeenCalledWith(
      expect.not.objectContaining({ employee_id: expect.anything() }),
    )
  })
})

describe('POST /api/leave', () => {
  let POST: (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>

  beforeEach(async () => {
    vi.clearAllMocks()
    clearAuthCache()
    mockSessionData = {
      employee_id: 'emp-001',
      wallet_address: '0xabc',
      name: 'Test User',
      role: 'employee',
    }

    // Default mock: employee exists with sufficient balance
    // Also handles middleware re-validation (first call with session employee_id)
    mockGetEmployeeById.mockResolvedValue(mockEmployee({ id: 'emp-001', start_date: '2024-01-15', role: 'employee' }))
    mockGetLeavePolicies.mockResolvedValue([
      { id: 'p1', employee_id: 'emp-001', leave_type: 'annual', total_days: 20, expires_at: null, created_at: '', updated_at: '' },
    ])
    mockGetApprovedDaysInPeriod.mockResolvedValue(0)
    mockGetPublicHolidayDatesInRange.mockResolvedValue([])
    mockCreateLeaveRequest.mockResolvedValue(mockLeaveRequest())

    const mod = await import('@/app/api/leave/route')
    POST = mod.POST
  })

  it('returns 401 when not authenticated', async () => {
    mockSessionData = { employee_id: '' }

    const req = new NextRequest('http://localhost/api/leave', {
      method: 'POST',
      body: JSON.stringify({
        leave_type: 'annual',
        start_date: '2026-04-01',
        end_date: '2026-04-03',
      }),
    })
    const res = await POST(req, { params: Promise.resolve({}) })
    const json = await res.json()

    expect(res.status).toBe(401)
    expect(json.success).toBe(false)
  })

  it('returns 400 with invalid data', async () => {
    const req = new NextRequest('http://localhost/api/leave', {
      method: 'POST',
      body: JSON.stringify({
        leave_type: 'invalid_type',
        start_date: '2026-04-01',
        end_date: '2026-04-03',
      }),
    })
    const res = await POST(req, { params: Promise.resolve({}) })
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.success).toBe(false)
  })

  it('returns 400 when end date is before start date', async () => {
    const req = new NextRequest('http://localhost/api/leave', {
      method: 'POST',
      body: JSON.stringify({
        leave_type: 'annual',
        start_date: '2026-04-05',
        end_date: '2026-04-01',
      }),
    })
    const res = await POST(req, { params: Promise.resolve({}) })
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.success).toBe(false)
  })

  it('creates a leave request with valid data', async () => {
    const created = mockLeaveRequest({ id: 'new-lr', status: 'pending', days: 3 })
    mockCreateLeaveRequest.mockResolvedValue(created)

    const req = new NextRequest('http://localhost/api/leave', {
      method: 'POST',
      body: JSON.stringify({
        leave_type: 'annual',
        start_date: '2026-04-06',
        end_date: '2026-04-08',
        delegate_ids: ['d0000000-0000-4000-a000-000000000002'],
        handover_url: 'https://docs.google.com/handover',
      }),
    })
    const res = await POST(req, { params: Promise.resolve({}) })
    const json = await res.json()

    expect(res.status).toBe(201)
    expect(json.success).toBe(true)
    expect(json.data.id).toBe('new-lr')
  })

  it('returns 400 when no working days in range (weekend only)', async () => {
    // 2026-05-02 is Saturday, 2026-05-03 is Sunday (>7 days away to pass advance check)
    const req = new NextRequest('http://localhost/api/leave', {
      method: 'POST',
      body: JSON.stringify({
        leave_type: 'annual',
        start_date: '2026-05-02',
        end_date: '2026-05-03',
      }),
    })
    const res = await POST(req, { params: Promise.resolve({}) })
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toContain('No working days')
  })



  // --- Leave type + field combination tests (regression coverage) ---

  it('allows remote work without delegates', async () => {
    const created = mockLeaveRequest({ id: 'remote-lr', leave_type: 'remote', status: 'pending', days: 1 })
    mockCreateLeaveRequest.mockResolvedValue(created)
    mockGetLeavePolicies.mockResolvedValue([
      { id: 'p-remote', employee_id: 'emp-001', leave_type: 'remote', total_days: 50, expires_at: null, created_at: '', updated_at: '' },
    ])

    const req = new NextRequest('http://localhost/api/leave', {
      method: 'POST',
      body: JSON.stringify({
        leave_type: 'remote',
        start_date: '2026-04-06',
        end_date: '2026-04-06',
        notes: 'Working from home',
      }),
    })
    const res = await POST(req, { params: Promise.resolve({}) })
    const json = await res.json()

    expect(res.status).toBe(201)
    expect(json.success).toBe(true)
  })

  it('returns 400 when non-remote leave has no delegates', async () => {
    mockGetLeavePolicies.mockResolvedValue([
      { id: 'p-sick', employee_id: 'emp-001', leave_type: 'sick', total_days: 30, expires_at: null, created_at: '', updated_at: '' },
    ])

    const req = new NextRequest('http://localhost/api/leave', {
      method: 'POST',
      body: JSON.stringify({
        leave_type: 'sick',
        start_date: '2026-04-06',
        end_date: '2026-04-06',
        notes: 'Feeling unwell',
      }),
    })
    const res = await POST(req, { params: Promise.resolve({}) })
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toContain('delegate')
  })

  it('allows remote work without handover_url even for 3+ days', async () => {
    const created = mockLeaveRequest({ id: 'remote-3d', leave_type: 'remote', status: 'pending', days: 3 })
    mockCreateLeaveRequest.mockResolvedValue(created)
    mockGetLeavePolicies.mockResolvedValue([
      { id: 'p-remote', employee_id: 'emp-001', leave_type: 'remote', total_days: 50, expires_at: null, created_at: '', updated_at: '' },
    ])

    const req = new NextRequest('http://localhost/api/leave', {
      method: 'POST',
      body: JSON.stringify({
        leave_type: 'remote',
        start_date: '2026-04-06',
        end_date: '2026-04-08',
        notes: 'Working from home this week',
      }),
    })
    const res = await POST(req, { params: Promise.resolve({}) })
    const json = await res.json()

    expect(res.status).toBe(201)
    expect(json.success).toBe(true)
  })

  it('returns 400 when non-remote 3+ day leave has no handover_url', async () => {
    const req = new NextRequest('http://localhost/api/leave', {
      method: 'POST',
      body: JSON.stringify({
        leave_type: 'annual',
        start_date: '2026-04-06',
        end_date: '2026-04-08',
        delegate_ids: ['d0000000-0000-4000-a000-000000000002'],
      }),
    })
    const res = await POST(req, { params: Promise.resolve({}) })
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toContain('Handover')
  })

  it('returns 400 when insufficient leave balance', async () => {
    mockGetApprovedDaysInPeriod.mockResolvedValue(19) // Used 19 of 20

    const req = new NextRequest('http://localhost/api/leave', {
      method: 'POST',
      body: JSON.stringify({
        leave_type: 'annual',
        start_date: '2026-04-06',
        end_date: '2026-04-10', // 5 working days but only 1 remaining
        delegate_ids: ['d0000000-0000-4000-a000-000000000002'],
        handover_url: 'https://docs.google.com/handover',
      }),
    })
    const res = await POST(req, { params: Promise.resolve({}) })
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toContain('Insufficient')
  })
})

describe('PATCH /api/leave/[id]', () => {
  let PATCH: (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>

  beforeEach(async () => {
    vi.clearAllMocks()
    clearAuthCache()
    mockSessionData = {
      employee_id: 'admin-001',
      wallet_address: '0xadmin',
      name: 'Admin User',
      role: 'admin',
    }
    // withAuth middleware re-validates role from DB
    mockGetEmployeeById.mockImplementation((id: string) => {
      if (id === 'admin-001') return Promise.resolve(mockEmployee({ id: 'admin-001', role: 'admin', name: 'Admin User' }))
      if (id === 'emp-001') return Promise.resolve(mockEmployee({ id: 'emp-001', role: 'employee', name: 'Test User' }))
      if (id === 'emp-999') return Promise.resolve(mockEmployee({ id: 'emp-999', role: 'employee', name: 'Other User' }))
      return Promise.resolve(null)
    })

    const mod = await import('@/app/api/leave/[id]/route')
    PATCH = mod.PATCH
  })

  it('returns 401 when not authenticated', async () => {
    mockSessionData = { employee_id: '' }

    const req = new NextRequest('http://localhost/api/leave/some-id', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'approved' }),
    })
    const res = await PATCH(req, {
      params: Promise.resolve({ id: '550e8400-e29b-41d4-a716-446655440000' }),
    })
    const json = await res.json()

    expect(res.status).toBe(401)
    expect(json.success).toBe(false)
  })

  it('returns 400 with invalid UUID', async () => {
    const req = new NextRequest('http://localhost/api/leave/not-a-uuid', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'approved' }),
    })
    const res = await PATCH(req, {
      params: Promise.resolve({ id: 'not-a-uuid' }),
    })
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toContain('Invalid request ID')
  })

  it('returns 404 when leave request not found', async () => {
    mockGetLeaveRequestById.mockResolvedValue(null)

    const req = new NextRequest('http://localhost/api/leave/550e8400-e29b-41d4-a716-446655440000', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'approved' }),
    })
    const res = await PATCH(req, {
      params: Promise.resolve({ id: '550e8400-e29b-41d4-a716-446655440000' }),
    })
    const json = await res.json()

    expect(res.status).toBe(404)
    expect(json.error).toContain('not found')
  })

  it('admin can approve a pending leave request', async () => {
    const pendingRequest = mockLeaveRequest({ status: 'pending' })
    mockGetLeaveRequestById.mockResolvedValue(pendingRequest)
    const approvedRequest = mockLeaveRequest({ status: 'approved' })
    mockUpdateLeaveRequest.mockResolvedValue(approvedRequest)

    const req = new NextRequest('http://localhost/api/leave/550e8400-e29b-41d4-a716-446655440000', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'approved' }),
    })
    const res = await PATCH(req, {
      params: Promise.resolve({ id: '550e8400-e29b-41d4-a716-446655440000' }),
    })
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data.status).toBe('approved')
  })

  it('admin can reject a pending leave request', async () => {
    const pendingRequest = mockLeaveRequest({ status: 'pending' })
    mockGetLeaveRequestById.mockResolvedValue(pendingRequest)
    const rejectedRequest = mockLeaveRequest({ status: 'rejected' })
    mockUpdateLeaveRequest.mockResolvedValue(rejectedRequest)

    const req = new NextRequest('http://localhost/api/leave/550e8400-e29b-41d4-a716-446655440000', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'rejected' }),
    })
    const res = await PATCH(req, {
      params: Promise.resolve({ id: '550e8400-e29b-41d4-a716-446655440000' }),
    })
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data.status).toBe('rejected')
  })

  it('non-admin cannot approve or reject', async () => {
    mockSessionData.role = 'employee'
    mockSessionData.employee_id = 'emp-999'

    const pendingRequest = mockLeaveRequest({ status: 'pending', employee_id: 'emp-001' })
    mockGetLeaveRequestById.mockResolvedValue(pendingRequest)

    const req = new NextRequest('http://localhost/api/leave/550e8400-e29b-41d4-a716-446655440000', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'approved' }),
    })
    const res = await PATCH(req, {
      params: Promise.resolve({ id: '550e8400-e29b-41d4-a716-446655440000' }),
    })
    const json = await res.json()

    expect(res.status).toBe(403)
    expect(json.error).toBe('Forbidden')
  })

  it('returns 400 when trying to approve an already approved request', async () => {
    const approvedRequest = mockLeaveRequest({ status: 'approved' })
    mockGetLeaveRequestById.mockResolvedValue(approvedRequest)

    const req = new NextRequest('http://localhost/api/leave/550e8400-e29b-41d4-a716-446655440000', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'approved' }),
    })
    const res = await PATCH(req, {
      params: Promise.resolve({ id: '550e8400-e29b-41d4-a716-446655440000' }),
    })
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toContain('Only pending requests')
  })

  it('employee can cancel their own pending request', async () => {
    mockSessionData.role = 'employee'
    mockSessionData.employee_id = 'emp-001'

    const pendingRequest = mockLeaveRequest({ status: 'pending', employee_id: 'emp-001' })
    mockGetLeaveRequestById.mockResolvedValue(pendingRequest)
    const cancelledRequest = mockLeaveRequest({ status: 'cancelled' })
    mockUpdateLeaveRequest.mockResolvedValue(cancelledRequest)

    const req = new NextRequest('http://localhost/api/leave/550e8400-e29b-41d4-a716-446655440000', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'cancelled' }),
    })
    const res = await PATCH(req, {
      params: Promise.resolve({ id: '550e8400-e29b-41d4-a716-446655440000' }),
    })
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data.status).toBe('cancelled')
  })

  it('employee cannot cancel another employee request', async () => {
    mockSessionData.role = 'employee'
    mockSessionData.employee_id = 'emp-999'

    const pendingRequest = mockLeaveRequest({ status: 'pending', employee_id: 'emp-001' })
    mockGetLeaveRequestById.mockResolvedValue(pendingRequest)

    const req = new NextRequest('http://localhost/api/leave/550e8400-e29b-41d4-a716-446655440000', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'cancelled' }),
    })
    const res = await PATCH(req, {
      params: Promise.resolve({ id: '550e8400-e29b-41d4-a716-446655440000' }),
    })
    const json = await res.json()

    expect(res.status).toBe(403)
    expect(json.error).toBe('Forbidden')
  })

  it('employee cannot cancel a rejected request', async () => {
    mockSessionData.role = 'employee'
    mockSessionData.employee_id = 'emp-001'

    const rejectedRequest = mockLeaveRequest({ status: 'rejected', employee_id: 'emp-001' })
    mockGetLeaveRequestById.mockResolvedValue(rejectedRequest)

    const req = new NextRequest('http://localhost/api/leave/550e8400-e29b-41d4-a716-446655440000', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'cancelled' }),
    })
    const res = await PATCH(req, {
      params: Promise.resolve({ id: '550e8400-e29b-41d4-a716-446655440000' }),
    })
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toContain('Only pending or approved')
  })
})
