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

// Mock slack users
const mockGetSlackUsers = vi.fn()

vi.mock('@/lib/slack/users', () => ({
  getSlackUsers: (...args: unknown[]) => mockGetSlackUsers(...args),
}))

describe('GET /api/slack/users', () => {
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
      if (id === 'emp-001') return Promise.resolve(mockEmployee({ id: 'emp-001', role: 'employee', name: 'Test User' }))
      return Promise.resolve(null)
    })
    mockGetSlackUsers.mockResolvedValue([])

    const mod = await import('@/app/api/slack/users/route')
    GET = mod.GET
  })

  it('returns 401 when not authenticated', async () => {
    mockSessionData = { employee_id: '' }

    const req = new NextRequest('http://localhost/api/slack/users')
    const res = await GET(req, { params: Promise.resolve({}) })
    const json = await res.json()

    expect(res.status).toBe(401)
    expect(json.success).toBe(false)
  })

  it('returns Slack users for authenticated user', async () => {
    const slackUsers = [
      {
        employee_id: 'emp-002',
        slack_user_id: 'U002',
        name: 'Alice',
        display_name: 'alice',
        avatar_url: 'https://example.com/avatar.png',
      },
      {
        employee_id: null,
        slack_user_id: 'U003',
        name: 'Bob External',
        display_name: 'bob',
        avatar_url: null,
      },
    ]
    mockGetSlackUsers.mockResolvedValue(slackUsers)

    const req = new NextRequest('http://localhost/api/slack/users')
    const res = await GET(req, { params: Promise.resolve({}) })
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data).toHaveLength(2)
    expect(json.data[0].name).toBe('Alice')
    expect(mockGetSlackUsers).toHaveBeenCalledWith('emp-001')
  })

  it('returns empty list when no Slack users', async () => {
    mockGetSlackUsers.mockResolvedValue([])

    const req = new NextRequest('http://localhost/api/slack/users')
    const res = await GET(req, { params: Promise.resolve({}) })
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data).toHaveLength(0)
  })

  it('returns 500 when getSlackUsers throws', async () => {
    mockGetSlackUsers.mockRejectedValue(new Error('Slack API error'))

    const req = new NextRequest('http://localhost/api/slack/users')
    const res = await GET(req, { params: Promise.resolve({}) })
    const json = await res.json()

    expect(res.status).toBe(500)
    expect(json.error).toContain('Failed to fetch Slack users')
  })
})
