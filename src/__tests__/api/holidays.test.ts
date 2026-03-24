import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { mockEmployee } from '@/__tests__/helpers/mocks'
import type { PublicHoliday } from '@/types'

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
const mockGetPublicHolidays = vi.fn()
const mockCreatePublicHoliday = vi.fn()
const mockDeletePublicHoliday = vi.fn()
const mockInsertAuditLog = vi.fn(() => Promise.resolve())

vi.mock('@/lib/supabase/queries', () => ({
  getEmployeeById: (...args: unknown[]) => mockGetEmployeeById(...args),
  getPublicHolidays: (...args: unknown[]) => mockGetPublicHolidays(...args),
  createPublicHoliday: (...args: unknown[]) => mockCreatePublicHoliday(...args),
  deletePublicHoliday: (...args: unknown[]) => mockDeletePublicHoliday(...args),
  insertAuditLog: (...args: unknown[]) => mockInsertAuditLog(...args),
}))

// Mock rate limiter
vi.mock('@/lib/security/rate-limit', () => ({
  getClientIp: vi.fn(() => '127.0.0.1'),
}))

function mockHoliday(overrides: Partial<PublicHoliday> = {}): PublicHoliday {
  return {
    id: 'holiday-001',
    date: '2026-01-01',
    name: 'New Year',
    description: null,
    year: 2026,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('GET /api/holidays', () => {
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
    mockGetEmployeeById.mockImplementation((id: string) => {
      if (id === 'emp-001') return Promise.resolve(mockEmployee({ id: 'emp-001', role: 'employee' }))
      if (id === 'admin-001') return Promise.resolve(mockEmployee({ id: 'admin-001', role: 'admin' }))
      return Promise.resolve(null)
    })
    mockGetPublicHolidays.mockResolvedValue([])

    const mod = await import('@/app/api/holidays/route')
    GET = mod.GET
  })

  it('returns 401 when not authenticated', async () => {
    mockSessionData = { employee_id: '' }
    const req = new NextRequest('http://localhost/api/holidays')
    const res = await GET(req, { params: Promise.resolve({}) })
    const json = await res.json()

    expect(res.status).toBe(401)
    expect(json.success).toBe(false)
  })

  it('returns holidays for authenticated user', async () => {
    const holidays = [mockHoliday(), mockHoliday({ id: 'holiday-002', date: '2026-02-28', name: 'Peace Day' })]
    mockGetPublicHolidays.mockResolvedValue(holidays)

    const req = new NextRequest('http://localhost/api/holidays')
    const res = await GET(req, { params: Promise.resolve({}) })
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data).toHaveLength(2)
  })

  it('filters by year when provided', async () => {
    mockGetPublicHolidays.mockResolvedValue([])

    const req = new NextRequest('http://localhost/api/holidays?year=2026')
    const res = await GET(req, { params: Promise.resolve({}) })

    expect(res.status).toBe(200)
    expect(mockGetPublicHolidays).toHaveBeenCalledWith(2026)
  })

  it('returns 400 for invalid year parameter', async () => {
    const req = new NextRequest('http://localhost/api/holidays?year=abc')
    const res = await GET(req, { params: Promise.resolve({}) })
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toContain('Invalid year')
  })

  it('returns all holidays when no year is specified', async () => {
    mockGetPublicHolidays.mockResolvedValue([])

    const req = new NextRequest('http://localhost/api/holidays')
    const res = await GET(req, { params: Promise.resolve({}) })

    expect(res.status).toBe(200)
    expect(mockGetPublicHolidays).toHaveBeenCalledWith(undefined)
  })

  it('returns 500 when getPublicHolidays throws', async () => {
    mockGetPublicHolidays.mockRejectedValue(new Error('DB error'))

    const req = new NextRequest('http://localhost/api/holidays')
    const res = await GET(req, { params: Promise.resolve({}) })
    const json = await res.json()

    expect(res.status).toBe(500)
    expect(json.error).toContain('Failed to fetch holidays')
  })
})

describe('POST /api/holidays', () => {
  let POST: (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>

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
    mockCreatePublicHoliday.mockResolvedValue(mockHoliday())

    const mod = await import('@/app/api/holidays/route')
    POST = mod.POST
  })

  it('returns 401 when not authenticated', async () => {
    mockSessionData = { employee_id: '' }

    const req = new NextRequest('http://localhost/api/holidays', {
      method: 'POST',
      body: JSON.stringify({ date: '2026-01-01', name: 'New Year', year: 2026 }),
    })
    const res = await POST(req, { params: Promise.resolve({}) })
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

    const req = new NextRequest('http://localhost/api/holidays', {
      method: 'POST',
      body: JSON.stringify({ date: '2026-01-01', name: 'New Year', year: 2026 }),
    })
    const res = await POST(req, { params: Promise.resolve({}) })
    const json = await res.json()

    expect(res.status).toBe(403)
    expect(json.error).toBe('Forbidden')
  })

  it('creates a holiday with valid data', async () => {
    const created = mockHoliday({ id: 'new-holiday', name: 'Labor Day', date: '2026-05-01' })
    mockCreatePublicHoliday.mockResolvedValue(created)

    const req = new NextRequest('http://localhost/api/holidays', {
      method: 'POST',
      body: JSON.stringify({ date: '2026-05-01', name: 'Labor Day', year: 2026 }),
    })
    const res = await POST(req, { params: Promise.resolve({}) })
    const json = await res.json()

    expect(res.status).toBe(201)
    expect(json.success).toBe(true)
    expect(json.data.name).toBe('Labor Day')
  })

  it('writes an audit log on successful creation', async () => {
    const created = mockHoliday()
    mockCreatePublicHoliday.mockResolvedValue(created)

    const req = new NextRequest('http://localhost/api/holidays', {
      method: 'POST',
      body: JSON.stringify({ date: '2026-01-01', name: 'New Year', year: 2026 }),
    })
    await POST(req, { params: Promise.resolve({}) })

    expect(mockInsertAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_id: 'admin-001',
        action: 'holiday.create',
        resource_type: 'public_holiday',
      }),
    )
  })

  it('returns 400 with invalid data (missing name)', async () => {
    const req = new NextRequest('http://localhost/api/holidays', {
      method: 'POST',
      body: JSON.stringify({ date: '2026-01-01', year: 2026 }),
    })
    const res = await POST(req, { params: Promise.resolve({}) })
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.success).toBe(false)
  })

  it('returns 400 with invalid date format', async () => {
    const req = new NextRequest('http://localhost/api/holidays', {
      method: 'POST',
      body: JSON.stringify({ date: '01-01-2026', name: 'New Year', year: 2026 }),
    })
    const res = await POST(req, { params: Promise.resolve({}) })
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.success).toBe(false)
  })

  it('returns 409 on duplicate holiday date', async () => {
    mockCreatePublicHoliday.mockRejectedValue(new Error('duplicate key violation'))

    const req = new NextRequest('http://localhost/api/holidays', {
      method: 'POST',
      body: JSON.stringify({ date: '2026-01-01', name: 'New Year', year: 2026 }),
    })
    const res = await POST(req, { params: Promise.resolve({}) })
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(json.error).toContain('already exists')
  })

  it('returns 500 on unexpected error', async () => {
    mockCreatePublicHoliday.mockRejectedValue(new Error('Unexpected DB failure'))

    const req = new NextRequest('http://localhost/api/holidays', {
      method: 'POST',
      body: JSON.stringify({ date: '2026-01-01', name: 'New Year', year: 2026 }),
    })
    const res = await POST(req, { params: Promise.resolve({}) })
    const json = await res.json()

    expect(res.status).toBe(500)
    expect(json.error).toContain('Failed to create holiday')
  })
})

describe('DELETE /api/holidays/[id]', () => {
  let DELETE: (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>

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
    mockDeletePublicHoliday.mockResolvedValue(undefined)

    const mod = await import('@/app/api/holidays/[id]/route')
    DELETE = mod.DELETE
  })

  it('returns 401 when not authenticated', async () => {
    mockSessionData = { employee_id: '' }

    const req = new NextRequest('http://localhost/api/holidays/550e8400-e29b-41d4-a716-446655440000', {
      method: 'DELETE',
    })
    const res = await DELETE(req, {
      params: Promise.resolve({ id: '550e8400-e29b-41d4-a716-446655440000' }),
    })
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

    const req = new NextRequest('http://localhost/api/holidays/550e8400-e29b-41d4-a716-446655440000', {
      method: 'DELETE',
    })
    const res = await DELETE(req, {
      params: Promise.resolve({ id: '550e8400-e29b-41d4-a716-446655440000' }),
    })
    const json = await res.json()

    expect(res.status).toBe(403)
    expect(json.error).toBe('Forbidden')
  })

  it('returns 400 with invalid UUID', async () => {
    const req = new NextRequest('http://localhost/api/holidays/bad-id', {
      method: 'DELETE',
    })
    const res = await DELETE(req, {
      params: Promise.resolve({ id: 'bad-id' }),
    })
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toContain('Invalid holiday ID')
  })

  it('successfully deletes a holiday', async () => {
    const req = new NextRequest('http://localhost/api/holidays/550e8400-e29b-41d4-a716-446655440000', {
      method: 'DELETE',
    })
    const res = await DELETE(req, {
      params: Promise.resolve({ id: '550e8400-e29b-41d4-a716-446655440000' }),
    })
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(mockDeletePublicHoliday).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000')
  })

  it('writes an audit log on successful deletion', async () => {
    const req = new NextRequest('http://localhost/api/holidays/550e8400-e29b-41d4-a716-446655440000', {
      method: 'DELETE',
    })
    await DELETE(req, {
      params: Promise.resolve({ id: '550e8400-e29b-41d4-a716-446655440000' }),
    })

    expect(mockInsertAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_id: 'admin-001',
        action: 'holiday.delete',
        resource_type: 'public_holiday',
        resource_id: '550e8400-e29b-41d4-a716-446655440000',
      }),
    )
  })

  it('returns 500 when deletePublicHoliday throws', async () => {
    mockDeletePublicHoliday.mockRejectedValue(new Error('DB error'))

    const req = new NextRequest('http://localhost/api/holidays/550e8400-e29b-41d4-a716-446655440000', {
      method: 'DELETE',
    })
    const res = await DELETE(req, {
      params: Promise.resolve({ id: '550e8400-e29b-41d4-a716-446655440000' }),
    })
    const json = await res.json()

    expect(res.status).toBe(500)
    expect(json.error).toContain('Failed to delete holiday')
  })
})
