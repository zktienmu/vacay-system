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
const mockCreateEmployee = vi.fn()
const mockGetEmployeeById = vi.fn()
const mockUpdateEmployee = vi.fn()
const mockInsertAuditLog = vi.fn(() => Promise.resolve())

const mockGetAdminCount = vi.fn(() => Promise.resolve(2))

vi.mock('@/lib/supabase/queries', () => ({
  getAllEmployees: (...args: unknown[]) => mockGetAllEmployees(...args),
  createEmployee: (...args: unknown[]) => mockCreateEmployee(...args),
  getEmployeeById: (...args: unknown[]) => mockGetEmployeeById(...args),
  updateEmployee: (...args: unknown[]) => mockUpdateEmployee(...args),
  insertAuditLog: (...args: unknown[]) => mockInsertAuditLog(...args),
  getAdminCount: (...args: unknown[]) => mockGetAdminCount(...args),
}))

describe('GET /api/employees', () => {
  let GET: (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>

  beforeEach(async () => {
    vi.clearAllMocks()
    mockSessionData = {
      employee_id: 'admin-001',
      wallet_address: '0xadmin',
      name: 'Admin User',
      role: 'admin',
    }
    // withAuth middleware re-validates role from DB
    mockGetEmployeeById.mockImplementation((id: string) => {
      if (id === 'admin-001') return Promise.resolve(mockEmployee({ id: 'admin-001', role: 'admin', name: 'Admin User' }))
      return Promise.resolve(null)
    })
    const mod = await import('@/app/api/employees/route')
    GET = mod.GET
  })

  it('returns 401 when not authenticated', async () => {
    mockSessionData = { employee_id: '' }

    const req = new NextRequest('http://localhost/api/employees')
    const res = await GET(req, { params: Promise.resolve({}) })
    const json = await res.json()

    expect(res.status).toBe(401)
    expect(json.success).toBe(false)
  })

  it('returns 403 for non-admin users', async () => {
    mockSessionData.role = 'employee'
    // Middleware re-validates role from DB — return employee role
    mockGetEmployeeById.mockImplementation((id: string) => {
      if (id === 'admin-001') return Promise.resolve(mockEmployee({ id: 'admin-001', role: 'employee', name: 'Admin User' }))
      return Promise.resolve(null)
    })

    const req = new NextRequest('http://localhost/api/employees')
    const res = await GET(req, { params: Promise.resolve({}) })
    const json = await res.json()

    expect(res.status).toBe(403)
    expect(json.error).toBe('Forbidden')
  })

  it('returns employees list for admin', async () => {
    const employees = [mockEmployee({ id: 'e1', name: 'Alice' }), mockEmployee({ id: 'e2', name: 'Bob' })]
    mockGetAllEmployees.mockResolvedValue(employees)

    const req = new NextRequest('http://localhost/api/employees')
    const res = await GET(req, { params: Promise.resolve({}) })
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data).toHaveLength(2)
  })
})

describe('POST /api/employees', () => {
  let POST: (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>

  beforeEach(async () => {
    vi.clearAllMocks()
    mockSessionData = {
      employee_id: 'admin-001',
      wallet_address: '0xadmin',
      name: 'Admin User',
      role: 'admin',
    }
    // withAuth middleware re-validates role from DB
    mockGetEmployeeById.mockImplementation((id: string) => {
      if (id === 'admin-001') return Promise.resolve(mockEmployee({ id: 'admin-001', role: 'admin', name: 'Admin User' }))
      return Promise.resolve(null)
    })
    const mod = await import('@/app/api/employees/route')
    POST = mod.POST
  })

  it('returns 401 when not authenticated', async () => {
    mockSessionData = { employee_id: '' }

    const req = new NextRequest('http://localhost/api/employees', {
      method: 'POST',
      body: JSON.stringify({
        wallet_address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        name: 'New Employee',
        start_date: '2026-03-01',
      }),
    })
    const res = await POST(req, { params: Promise.resolve({}) })

    expect(res.status).toBe(401)
  })

  it('returns 403 for non-admin users', async () => {
    mockSessionData.role = 'employee'
    // Middleware re-validates role from DB — return employee role
    mockGetEmployeeById.mockImplementation((id: string) => {
      if (id === 'admin-001') return Promise.resolve(mockEmployee({ id: 'admin-001', role: 'employee', name: 'Admin User' }))
      return Promise.resolve(null)
    })

    const req = new NextRequest('http://localhost/api/employees', {
      method: 'POST',
      body: JSON.stringify({
        wallet_address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        name: 'New Employee',
        start_date: '2026-03-01',
      }),
    })
    const res = await POST(req, { params: Promise.resolve({}) })

    expect(res.status).toBe(403)
  })

  it('returns 400 with invalid data', async () => {
    const req = new NextRequest('http://localhost/api/employees', {
      method: 'POST',
      body: JSON.stringify({
        wallet_address: 'bad-address',
        name: '',
        start_date: '2026-03-01',
      }),
    })
    const res = await POST(req, { params: Promise.resolve({}) })
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.success).toBe(false)
  })

  it('creates an employee with valid data', async () => {
    const newEmployee = mockEmployee({
      id: 'emp-new',
      wallet_address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      name: 'New Employee',
    })
    mockCreateEmployee.mockResolvedValue(newEmployee)

    const req = new NextRequest('http://localhost/api/employees', {
      method: 'POST',
      body: JSON.stringify({
        wallet_address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        name: 'New Employee',
        start_date: '2026-03-01',
      }),
    })
    const res = await POST(req, { params: Promise.resolve({}) })
    const json = await res.json()

    expect(res.status).toBe(201)
    expect(json.success).toBe(true)
    expect(json.data.name).toBe('New Employee')
  })

  it('returns 409 on duplicate wallet address', async () => {
    mockCreateEmployee.mockRejectedValue(new Error('duplicate key violation'))

    const req = new NextRequest('http://localhost/api/employees', {
      method: 'POST',
      body: JSON.stringify({
        wallet_address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        name: 'Duplicate',
        start_date: '2026-03-01',
      }),
    })
    const res = await POST(req, { params: Promise.resolve({}) })
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(json.error).toContain('already exists')
  })
})

describe('PATCH /api/employees/[id]', () => {
  let PATCH: (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>

  beforeEach(async () => {
    vi.clearAllMocks()
    mockSessionData = {
      employee_id: 'admin-001',
      wallet_address: '0xadmin',
      name: 'Admin User',
      role: 'admin',
    }
    // withAuth middleware re-validates role from DB
    mockGetEmployeeById.mockImplementation((id: string) => {
      if (id === 'admin-001') return Promise.resolve(mockEmployee({ id: 'admin-001', role: 'admin', name: 'Admin User' }))
      return Promise.resolve(null)
    })
    const mod = await import('@/app/api/employees/[id]/route')
    PATCH = mod.PATCH
  })

  it('returns 401 when not authenticated', async () => {
    mockSessionData = { employee_id: '' }

    const req = new NextRequest('http://localhost/api/employees/550e8400-e29b-41d4-a716-446655440000', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Updated' }),
    })
    const res = await PATCH(req, {
      params: Promise.resolve({ id: '550e8400-e29b-41d4-a716-446655440000' }),
    })

    expect(res.status).toBe(401)
  })

  it('returns 403 for non-admin users', async () => {
    mockSessionData.role = 'employee'
    // Middleware re-validates role from DB — return employee role
    mockGetEmployeeById.mockImplementation((id: string) => {
      if (id === 'admin-001') return Promise.resolve(mockEmployee({ id: 'admin-001', role: 'employee', name: 'Admin User' }))
      return Promise.resolve(null)
    })

    const req = new NextRequest('http://localhost/api/employees/550e8400-e29b-41d4-a716-446655440000', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Updated' }),
    })
    const res = await PATCH(req, {
      params: Promise.resolve({ id: '550e8400-e29b-41d4-a716-446655440000' }),
    })

    expect(res.status).toBe(403)
  })

  it('returns 400 with invalid UUID', async () => {
    const req = new NextRequest('http://localhost/api/employees/bad-id', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Updated' }),
    })
    const res = await PATCH(req, {
      params: Promise.resolve({ id: 'bad-id' }),
    })
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toContain('Invalid employee ID')
  })

  it('returns 404 when employee not found', async () => {
    // Middleware call returns admin, handler call returns null (target not found)
    mockGetEmployeeById.mockImplementation((id: string) => {
      if (id === 'admin-001') return Promise.resolve(mockEmployee({ id: 'admin-001', role: 'admin', name: 'Admin User' }))
      return Promise.resolve(null)
    })

    const req = new NextRequest('http://localhost/api/employees/550e8400-e29b-41d4-a716-446655440000', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Updated' }),
    })
    const res = await PATCH(req, {
      params: Promise.resolve({ id: '550e8400-e29b-41d4-a716-446655440000' }),
    })
    const json = await res.json()

    expect(res.status).toBe(404)
    expect(json.error).toContain('Employee not found')
  })

  it('updates employee with valid data', async () => {
    const existing = mockEmployee({ id: '550e8400-e29b-41d4-a716-446655440000' })
    const updated = mockEmployee({ id: '550e8400-e29b-41d4-a716-446655440000', name: 'Updated Name' })
    mockGetEmployeeById.mockImplementation((id: string) => {
      if (id === 'admin-001') return Promise.resolve(mockEmployee({ id: 'admin-001', role: 'admin', name: 'Admin User' }))
      return Promise.resolve(existing)
    })
    mockUpdateEmployee.mockResolvedValue(updated)

    const req = new NextRequest('http://localhost/api/employees/550e8400-e29b-41d4-a716-446655440000', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Updated Name' }),
    })
    const res = await PATCH(req, {
      params: Promise.resolve({ id: '550e8400-e29b-41d4-a716-446655440000' }),
    })
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data.name).toBe('Updated Name')
  })

  it('returns 400 with invalid update data', async () => {
    const req = new NextRequest('http://localhost/api/employees/550e8400-e29b-41d4-a716-446655440000', {
      method: 'PATCH',
      body: JSON.stringify({ wallet_address: 'invalid-addr' }),
    })
    const res = await PATCH(req, {
      params: Promise.resolve({ id: '550e8400-e29b-41d4-a716-446655440000' }),
    })
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.success).toBe(false)
  })

  it('returns 409 on duplicate wallet address', async () => {
    const existing = mockEmployee({ id: '550e8400-e29b-41d4-a716-446655440000' })
    mockGetEmployeeById.mockImplementation((id: string) => {
      if (id === 'admin-001') return Promise.resolve(mockEmployee({ id: 'admin-001', role: 'admin', name: 'Admin User' }))
      return Promise.resolve(existing)
    })
    mockUpdateEmployee.mockRejectedValue(new Error('duplicate key violation'))

    const req = new NextRequest('http://localhost/api/employees/550e8400-e29b-41d4-a716-446655440000', {
      method: 'PATCH',
      body: JSON.stringify({
        wallet_address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      }),
    })
    const res = await PATCH(req, {
      params: Promise.resolve({ id: '550e8400-e29b-41d4-a716-446655440000' }),
    })
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(json.error).toContain('Wallet address already in use')
  })
})
