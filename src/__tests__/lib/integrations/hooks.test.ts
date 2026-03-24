import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockEmployee, mockLeaveRequest } from '@/__tests__/helpers/mocks'
import type { Employee } from '@/types'

// Use vi.hoisted for all mock fns referenced in vi.mock factories
const {
  mockNotifyNewRequest,
  mockNotifyApproved,
  mockNotifyRejected,
  mockNotifyCancelled,
  mockNotifyDelegate,
  mockNotifyChainDelegation,
  mockCreateLeaveEvent,
  mockDeleteLeaveEvent,
  mockSupabaseFrom,
} = vi.hoisted(() => ({
  mockNotifyNewRequest: vi.fn().mockResolvedValue(undefined),
  mockNotifyApproved: vi.fn().mockResolvedValue(undefined),
  mockNotifyRejected: vi.fn().mockResolvedValue(undefined),
  mockNotifyCancelled: vi.fn().mockResolvedValue(undefined),
  mockNotifyDelegate: vi.fn().mockResolvedValue(undefined),
  mockNotifyChainDelegation: vi.fn().mockResolvedValue(undefined),
  mockCreateLeaveEvent: vi.fn().mockResolvedValue(null),
  mockDeleteLeaveEvent: vi.fn().mockResolvedValue(undefined),
  mockSupabaseFrom: vi.fn(),
}))

vi.mock('@/lib/slack/notify', () => ({
  notifyNewRequest: mockNotifyNewRequest,
  notifyApproved: mockNotifyApproved,
  notifyRejected: mockNotifyRejected,
  notifyCancelled: mockNotifyCancelled,
  notifyDelegate: mockNotifyDelegate,
  notifyChainDelegation: mockNotifyChainDelegation,
}))

vi.mock('@/lib/google/calendar', () => ({
  createLeaveEvent: mockCreateLeaveEvent,
  deleteLeaveEvent: mockDeleteLeaveEvent,
}))

vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    from: mockSupabaseFrom,
  },
}))

import {
  onLeaveRequestCreated,
  onLeaveRequestApproved,
  onLeaveRequestRejected,
  onLeaveRequestCancelled,
} from '@/lib/integrations/hooks'

// --- Supabase mock helpers ---

/** Configure supabase.from("employees").select("*").eq("id", ...).single() to return employee */
function setupEmployeeFetch(employee: Employee | null) {
  // This will be called for the next .from("employees") with .select().eq().single() chain
  const singleFn = vi.fn().mockResolvedValue({
    data: employee,
    error: employee ? null : { message: 'not found' },
  })
  const eqFn = vi.fn().mockReturnValue({ single: singleFn })
  const orFn = vi.fn().mockResolvedValue({ data: [], error: null })
  const selectFn = vi.fn().mockReturnValue({ eq: eqFn, or: orFn })

  mockSupabaseFrom.mockImplementation((table: string) => {
    if (table === 'employees') {
      return { select: selectFn }
    }
    if (table === 'leave_requests') {
      const updateEq = vi.fn().mockResolvedValue({ error: null })
      return { update: vi.fn().mockReturnValue({ eq: updateEq }) }
    }
    return {}
  })
}

/**
 * Configure supabase mock for the full approval flow:
 * - Multiple fetchEmployee calls (employee + delegates)
 * - fetchApprovers call
 * - leave_requests update
 */
function setupApprovalFlow(
  employee: Employee | null,
  delegates: (Employee | null)[],
  approvers?: Employee[],
) {
  // Build a queue of employee lookups: first the main employee, then delegates
  const employeeQueue = [employee, ...delegates]
  let employeeFetchIndex = 0

  const updateEq = vi.fn().mockResolvedValue({ error: null })
  const updateFn = vi.fn().mockReturnValue({ eq: updateEq })

  mockSupabaseFrom.mockImplementation((table: string) => {
    if (table === 'employees') {
      const singleFn = vi.fn().mockImplementation(() => {
        const emp = employeeQueue[employeeFetchIndex++] ?? null
        return Promise.resolve({
          data: emp,
          error: emp ? null : { message: 'not found' },
        })
      })
      const eqFn = vi.fn().mockReturnValue({ single: singleFn })
      const orFn = vi.fn().mockResolvedValue({
        data: approvers ?? [],
        error: null,
      })
      return { select: vi.fn().mockReturnValue({ eq: eqFn, or: orFn }) }
    }
    if (table === 'leave_requests') {
      return { update: updateFn }
    }
    return {}
  })

  return { updateFn, updateEq }
}

describe('onLeaveRequestCreated', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches employee and approvers, then calls notifyNewRequest', async () => {
    const employee = mockEmployee({ id: 'emp-001', name: 'Alice' })
    const approvers = [
      mockEmployee({ id: 'admin-1', role: 'admin' }),
      mockEmployee({ id: 'mgr-1', is_manager: true }),
    ]

    // For onLeaveRequestCreated: fetchEmployee then fetchApprovers
    const singleFn = vi.fn().mockResolvedValue({ data: employee, error: null })
    const eqFn = vi.fn().mockReturnValue({ single: singleFn })
    const orFn = vi.fn().mockResolvedValue({ data: approvers, error: null })

    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === 'employees') {
        return { select: vi.fn().mockReturnValue({ eq: eqFn, or: orFn }) }
      }
      return {}
    })

    const request = mockLeaveRequest({ employee_id: 'emp-001' })
    await onLeaveRequestCreated(request)

    expect(mockNotifyNewRequest).toHaveBeenCalledTimes(1)
    expect(mockNotifyNewRequest).toHaveBeenCalledWith(request, employee, approvers)
  })

  it('does nothing when employee is not found', async () => {
    setupEmployeeFetch(null)

    const request = mockLeaveRequest({ employee_id: 'unknown' })
    await onLeaveRequestCreated(request)

    expect(mockNotifyNewRequest).not.toHaveBeenCalled()
  })
})

describe('onLeaveRequestApproved', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('notifies employee, delegates, and creates calendar event', async () => {
    const employee = mockEmployee({ id: 'emp-001', name: 'Alice' })
    const delegate = mockEmployee({ id: 'del-001', name: 'Bob', slack_user_id: 'U-bob' })

    setupApprovalFlow(employee, [delegate])
    mockCreateLeaveEvent.mockResolvedValueOnce('gcal-evt-1')

    const request = mockLeaveRequest({
      employee_id: 'emp-001',
      delegate_id: 'del-001',
      delegate_ids: [],
    })

    await onLeaveRequestApproved(request)

    // notifyApproved called with delegate names (no assignments => undefined)
    expect(mockNotifyApproved).toHaveBeenCalledTimes(1)
    expect(mockNotifyApproved).toHaveBeenCalledWith(request, employee, ['Bob'], undefined)

    // notifyDelegate called for each delegate (no assignment => undefined)
    expect(mockNotifyDelegate).toHaveBeenCalledTimes(1)
    expect(mockNotifyDelegate).toHaveBeenCalledWith(request, employee, delegate, undefined)

    // Calendar event created
    expect(mockCreateLeaveEvent).toHaveBeenCalledWith(request, 'Alice')
  })

  it('uses delegate_ids when both delegate_id and delegate_ids are set', async () => {
    const employee = mockEmployee({ id: 'emp-001', name: 'Alice' })
    const del1 = mockEmployee({ id: 'del-1', name: 'Bob' })
    const del2 = mockEmployee({ id: 'del-2', name: 'Carol' })

    setupApprovalFlow(employee, [del1, del2])
    mockCreateLeaveEvent.mockResolvedValueOnce(null)

    const request = mockLeaveRequest({
      employee_id: 'emp-001',
      delegate_id: 'old-delegate',
      delegate_ids: ['del-1', 'del-2'],
    })

    await onLeaveRequestApproved(request)

    expect(mockNotifyApproved).toHaveBeenCalledWith(request, employee, ['Bob', 'Carol'], undefined)
    expect(mockNotifyDelegate).toHaveBeenCalledTimes(2)
  })

  it('passes resolved assignments when delegate_assignments is populated', async () => {
    const employee = mockEmployee({ id: 'emp-001', name: 'Alice' })
    const del1 = mockEmployee({ id: 'del-1', name: 'Bob', slack_user_id: 'U-bob' })
    const del2 = mockEmployee({ id: 'del-2', name: 'Carol', slack_user_id: 'U-carol' })

    setupApprovalFlow(employee, [del1, del2])
    mockCreateLeaveEvent.mockResolvedValueOnce(null)

    const request = mockLeaveRequest({
      employee_id: 'emp-001',
      delegate_ids: ['del-1', 'del-2'],
      delegate_assignments: [
        { delegate_id: 'del-1', dates: ['2026-04-01', '2026-04-02'], handover_note: 'Handle tickets' },
        { delegate_id: 'del-2', dates: ['2026-04-03'], handover_note: null },
      ],
    })

    await onLeaveRequestApproved(request)

    // notifyApproved receives resolved assignments with names
    expect(mockNotifyApproved).toHaveBeenCalledWith(
      request,
      employee,
      ['Bob', 'Carol'],
      [
        { name: 'Bob', dates: ['2026-04-01', '2026-04-02'], handover_note: 'Handle tickets' },
        { name: 'Carol', dates: ['2026-04-03'], handover_note: null },
      ],
    )

    // Each delegate receives their specific assignment
    expect(mockNotifyDelegate).toHaveBeenCalledWith(
      request, employee, del1,
      { dates: ['2026-04-01', '2026-04-02'], handover_note: 'Handle tickets' },
    )
    expect(mockNotifyDelegate).toHaveBeenCalledWith(
      request, employee, del2,
      { dates: ['2026-04-03'], handover_note: null },
    )
  })

  it('updates leave request with calendar_event_id when created', async () => {
    const employee = mockEmployee({ id: 'emp-001' })
    const { updateFn, updateEq } = setupApprovalFlow(employee, [])
    mockCreateLeaveEvent.mockResolvedValueOnce('gcal-evt-99')

    const request = mockLeaveRequest({
      id: 'lr-555',
      employee_id: 'emp-001',
      delegate_id: null,
      delegate_ids: [],
    })

    await onLeaveRequestApproved(request)

    expect(updateFn).toHaveBeenCalledWith({ calendar_event_id: 'gcal-evt-99' })
    expect(updateEq).toHaveBeenCalledWith('id', 'lr-555')
  })

  it('does not update DB when calendar event creation returns null', async () => {
    const employee = mockEmployee({ id: 'emp-001' })
    const { updateFn } = setupApprovalFlow(employee, [])
    mockCreateLeaveEvent.mockResolvedValueOnce(null)

    const request = mockLeaveRequest({
      employee_id: 'emp-001',
      delegate_id: null,
      delegate_ids: [],
    })

    await onLeaveRequestApproved(request)

    expect(updateFn).not.toHaveBeenCalled()
  })

  it('does nothing when employee is not found', async () => {
    setupApprovalFlow(null, [])

    const request = mockLeaveRequest()
    await onLeaveRequestApproved(request)

    expect(mockNotifyApproved).not.toHaveBeenCalled()
    expect(mockCreateLeaveEvent).not.toHaveBeenCalled()
  })

  it('sends targeted chain delegation notification when chain_delegations is populated', async () => {
    const employee = mockEmployee({ id: 'emp-bob', name: 'Bob', slack_user_id: 'U-bob' })
    const delegate = mockEmployee({ id: 'del-javan', name: 'Javan', slack_user_id: 'U-javan' })

    // setupApprovalFlow: employee, then delegate (for regular flow),
    // then delegate again (for chain delegation fetchEmployee(reassigned_to)),
    // then original requester (for chain delegation fetchEmployee(original_employee_id))
    const originalRequester = mockEmployee({ id: 'emp-alice', name: 'Alice' })
    const employeeQueue = [employee, delegate, delegate, originalRequester]
    let employeeFetchIndex = 0

    const updateEq = vi.fn().mockResolvedValue({ error: null })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEq })

    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === 'employees') {
        const singleFn = vi.fn().mockImplementation(() => {
          const emp = employeeQueue[employeeFetchIndex++] ?? null
          return Promise.resolve({
            data: emp,
            error: emp ? null : { message: 'not found' },
          })
        })
        const eqFn = vi.fn().mockReturnValue({ single: singleFn })
        const orFn = vi.fn().mockResolvedValue({ data: [], error: null })
        return { select: vi.fn().mockReturnValue({ eq: eqFn, or: orFn }) }
      }
      if (table === 'leave_requests') {
        return { update: updateFn }
      }
      return {}
    })

    mockCreateLeaveEvent.mockResolvedValueOnce(null)

    const request = mockLeaveRequest({
      employee_id: 'emp-bob',
      delegate_ids: ['del-javan'],
      start_date: '2026-04-01',
      end_date: '2026-04-03',
      chain_delegations: [
        {
          original_leave_id: 'lr-alice',
          original_employee_id: 'emp-alice',
          reassigned_to: 'del-javan',
          dates: ['2026-04-01', '2026-04-02'],
          handover_note: 'Handle client emails',
        },
      ],
    })

    await onLeaveRequestApproved(request)

    // Targeted: only Javan should be notified about Alice's chain delegation
    expect(mockNotifyChainDelegation).toHaveBeenCalledTimes(1)
    expect(mockNotifyChainDelegation).toHaveBeenCalledWith(
      'U-javan',
      'Bob',
      'Alice',
      expect.any(String), // formatted date range
      'Handle client emails',
    )
  })

  it('falls back to legacy broadcast when chain_delegations is empty', async () => {
    const employee = mockEmployee({ id: 'emp-bob', name: 'Bob', slack_user_id: 'U-bob' })
    const delegate = mockEmployee({ id: 'del-javan', name: 'Javan', slack_user_id: 'U-javan' })

    // Build a queue: employee, delegate, then for legacy chain delegation query
    const originalRequester = mockEmployee({ id: 'emp-alice', name: 'Alice' })
    const employeeQueue = [employee, delegate, originalRequester]
    let employeeFetchIndex = 0

    const updateEq = vi.fn().mockResolvedValue({ error: null })
    const updateFn = vi.fn().mockReturnValue({ eq: updateEq })

    // The legacy chain delegation path queries leave_requests with contains
    const chainSelectGte = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'lr-alice',
          employee_id: 'emp-alice',
          delegate_ids: ['emp-bob'],
          delegate_assignments: [
            { delegate_id: 'emp-bob', dates: ['2026-04-01'], handover_note: 'Legacy note' },
          ],
          start_date: '2026-03-30',
          end_date: '2026-04-05',
        },
      ],
      error: null,
    })
    const chainSelectLte = vi.fn().mockReturnValue({ gte: chainSelectGte })
    const chainSelectContains = vi.fn().mockReturnValue({ lte: chainSelectLte })
    const chainSelectEq = vi.fn().mockReturnValue({ contains: chainSelectContains })
    const chainSelectFn = vi.fn().mockReturnValue({ eq: chainSelectEq })

    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === 'employees') {
        const singleFn = vi.fn().mockImplementation(() => {
          const emp = employeeQueue[employeeFetchIndex++] ?? null
          return Promise.resolve({
            data: emp,
            error: emp ? null : { message: 'not found' },
          })
        })
        const eqFn = vi.fn().mockReturnValue({ single: singleFn })
        const orFn = vi.fn().mockResolvedValue({ data: [], error: null })
        return { select: vi.fn().mockReturnValue({ eq: eqFn, or: orFn }) }
      }
      if (table === 'leave_requests') {
        return {
          update: updateFn,
          select: chainSelectFn,
        }
      }
      return {}
    })

    mockCreateLeaveEvent.mockResolvedValueOnce(null)

    const request = mockLeaveRequest({
      employee_id: 'emp-bob',
      delegate_ids: ['del-javan'],
      start_date: '2026-04-01',
      end_date: '2026-04-03',
      chain_delegations: [], // empty = legacy path
    })

    await onLeaveRequestApproved(request)

    // Legacy broadcast: Javan should be notified about Alice's inherited duty
    expect(mockNotifyChainDelegation).toHaveBeenCalledTimes(1)
    expect(mockNotifyChainDelegation).toHaveBeenCalledWith(
      'U-javan',
      'Bob',
      'Alice',
      expect.any(String),
      'Legacy note',
    )
  })
})

describe('onLeaveRequestRejected', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends rejection notification to employee', async () => {
    const employee = mockEmployee({ id: 'emp-001' })
    setupEmployeeFetch(employee)

    const request = mockLeaveRequest({
      employee_id: 'emp-001',
      calendar_event_id: null,
    })

    await onLeaveRequestRejected(request)

    expect(mockNotifyRejected).toHaveBeenCalledTimes(1)
    expect(mockNotifyRejected).toHaveBeenCalledWith(request, employee)
  })

  it('deletes calendar event if one exists', async () => {
    const employee = mockEmployee({ id: 'emp-001' })
    setupEmployeeFetch(employee)

    const request = mockLeaveRequest({
      employee_id: 'emp-001',
      calendar_event_id: 'gcal-to-delete',
    })

    await onLeaveRequestRejected(request)

    expect(mockDeleteLeaveEvent).toHaveBeenCalledWith('gcal-to-delete')
  })

  it('does not delete calendar event if none exists', async () => {
    const employee = mockEmployee({ id: 'emp-001' })
    setupEmployeeFetch(employee)

    const request = mockLeaveRequest({
      employee_id: 'emp-001',
      calendar_event_id: null,
    })

    await onLeaveRequestRejected(request)

    expect(mockDeleteLeaveEvent).not.toHaveBeenCalled()
  })

  it('does nothing when employee is not found', async () => {
    setupEmployeeFetch(null)

    const request = mockLeaveRequest()
    await onLeaveRequestRejected(request)

    expect(mockNotifyRejected).not.toHaveBeenCalled()
  })
})

describe('onLeaveRequestCancelled', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('posts cancellation to Slack channel', async () => {
    const employee = mockEmployee({ id: 'emp-001' })
    setupEmployeeFetch(employee)

    const request = mockLeaveRequest({
      employee_id: 'emp-001',
      calendar_event_id: null,
    })

    await onLeaveRequestCancelled(request)

    expect(mockNotifyCancelled).toHaveBeenCalledTimes(1)
    expect(mockNotifyCancelled).toHaveBeenCalledWith(request, employee)
  })

  it('deletes calendar event if one exists', async () => {
    const employee = mockEmployee({ id: 'emp-001' })
    setupEmployeeFetch(employee)

    const request = mockLeaveRequest({
      employee_id: 'emp-001',
      calendar_event_id: 'gcal-cancel-this',
    })

    await onLeaveRequestCancelled(request)

    expect(mockDeleteLeaveEvent).toHaveBeenCalledWith('gcal-cancel-this')
  })

  it('does not delete calendar event if none exists', async () => {
    const employee = mockEmployee({ id: 'emp-001' })
    setupEmployeeFetch(employee)

    const request = mockLeaveRequest({
      employee_id: 'emp-001',
      calendar_event_id: null,
    })

    await onLeaveRequestCancelled(request)

    expect(mockDeleteLeaveEvent).not.toHaveBeenCalled()
  })

  it('still cleans up calendar when employee is not found', async () => {
    setupEmployeeFetch(null)

    const request = mockLeaveRequest({
      calendar_event_id: 'gcal-orphan',
    })

    await onLeaveRequestCancelled(request)

    // Slack notification is skipped (no employee), but calendar cleanup still happens
    expect(mockNotifyCancelled).not.toHaveBeenCalled()
    expect(mockDeleteLeaveEvent).toHaveBeenCalledWith('gcal-orphan')
  })

})
