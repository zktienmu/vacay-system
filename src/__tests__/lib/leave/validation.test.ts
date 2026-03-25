import { describe, it, expect } from 'vitest'
import {
  siweVerifySchema,
  createLeaveRequestSchema,
  updateLeaveStatusSchema,
  cancelLeaveSchema,
  createEmployeeSchema,
  updateEmployeeSchema,
  upsertPolicySchema,
} from '@/lib/leave/validation'

describe('siweVerifySchema', () => {
  it('accepts valid input', () => {
    const result = siweVerifySchema.safeParse({
      message: 'Sign in to Dinngo Leave System',
      signature: '0xabc123',
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty message', () => {
    const result = siweVerifySchema.safeParse({
      message: '',
      signature: '0xabc123',
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty signature', () => {
    const result = siweVerifySchema.safeParse({
      message: 'Sign in',
      signature: '',
    })
    expect(result.success).toBe(false)
  })

  it('rejects missing fields', () => {
    const result = siweVerifySchema.safeParse({})
    expect(result.success).toBe(false)
  })
})

describe('createLeaveRequestSchema', () => {
  const validRequest = {
    leave_type: 'annual',
    start_date: '2026-04-01',
    end_date: '2026-04-03',
  }

  it('accepts valid leave request', () => {
    const result = createLeaveRequestSchema.safeParse(validRequest)
    expect(result.success).toBe(true)
  })

  it('accepts all leave types', () => {
    const types = ['annual', 'personal', 'sick', 'official', 'unpaid', 'remote', 'family_care', 'menstrual']
    for (const type of types) {
      const result = createLeaveRequestSchema.safeParse({
        ...validRequest,
        leave_type: type,
        // notes required for non-annual, non-remote types
        notes: type !== 'annual' && type !== 'remote' ? 'Test reason' : undefined,
      })
      expect(result.success).toBe(true)
    }
  })

  it('rejects invalid leave type', () => {
    const result = createLeaveRequestSchema.safeParse({
      ...validRequest,
      leave_type: 'vacation',
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid date format', () => {
    const result = createLeaveRequestSchema.safeParse({
      ...validRequest,
      start_date: '04/01/2026',
    })
    expect(result.success).toBe(false)
  })

  it('rejects when end date is before start date', () => {
    const result = createLeaveRequestSchema.safeParse({
      ...validRequest,
      start_date: '2026-04-05',
      end_date: '2026-04-01',
    })
    expect(result.success).toBe(false)
  })

  it('accepts when end date equals start date (same-day leave)', () => {
    const result = createLeaveRequestSchema.safeParse({
      ...validRequest,
      start_date: '2026-04-01',
      end_date: '2026-04-01',
    })
    expect(result.success).toBe(true)
  })

  it('accepts optional delegate_id as UUID', () => {
    const result = createLeaveRequestSchema.safeParse({
      ...validRequest,
      delegate_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid UUID for delegate_id', () => {
    const result = createLeaveRequestSchema.safeParse({
      ...validRequest,
      delegate_id: 'not-a-uuid',
    })
    expect(result.success).toBe(false)
  })

  it('accepts null delegate_id', () => {
    const result = createLeaveRequestSchema.safeParse({
      ...validRequest,
      delegate_id: null,
    })
    expect(result.success).toBe(true)
  })

  it('accepts optional notes', () => {
    const result = createLeaveRequestSchema.safeParse({
      ...validRequest,
      notes: 'Family vacation',
    })
    expect(result.success).toBe(true)
  })

  it('rejects notes exceeding 1000 characters', () => {
    const result = createLeaveRequestSchema.safeParse({
      ...validRequest,
      notes: 'x'.repeat(1001),
    })
    expect(result.success).toBe(false)
  })

  it('accepts notes at exactly 1000 characters', () => {
    const result = createLeaveRequestSchema.safeParse({
      ...validRequest,
      notes: 'x'.repeat(1000),
    })
    expect(result.success).toBe(true)
  })

  it('accepts valid chain_delegations', () => {
    const result = createLeaveRequestSchema.safeParse({
      ...validRequest,
      chain_delegations: [
        {
          original_leave_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          original_employee_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567891',
          reassigned_to: 'a1b2c3d4-e5f6-7890-abcd-ef1234567892',
          dates: ['2026-04-01', '2026-04-02'],
          handover_note: 'Handle emails',
        },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('accepts chain_delegations with null handover_note', () => {
    const result = createLeaveRequestSchema.safeParse({
      ...validRequest,
      chain_delegations: [
        {
          original_leave_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          original_employee_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567891',
          reassigned_to: 'a1b2c3d4-e5f6-7890-abcd-ef1234567892',
          dates: ['2026-04-01'],
          handover_note: null,
        },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('defaults chain_delegations to empty array when omitted', () => {
    const result = createLeaveRequestSchema.safeParse(validRequest)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.chain_delegations).toEqual([])
    }
  })

  it('rejects chain_delegations with invalid UUID', () => {
    const result = createLeaveRequestSchema.safeParse({
      ...validRequest,
      chain_delegations: [
        {
          original_leave_id: 'not-a-uuid',
          original_employee_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567891',
          reassigned_to: 'a1b2c3d4-e5f6-7890-abcd-ef1234567892',
          dates: ['2026-04-01'],
          handover_note: null,
        },
      ],
    })
    expect(result.success).toBe(false)
  })

  it('rejects chain_delegations with missing required fields', () => {
    const result = createLeaveRequestSchema.safeParse({
      ...validRequest,
      chain_delegations: [
        {
          original_leave_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          // missing original_employee_id, reassigned_to, dates, handover_note
        },
      ],
    })
    expect(result.success).toBe(false)
  })
})

describe('updateLeaveStatusSchema', () => {
  it('accepts approved status', () => {
    const result = updateLeaveStatusSchema.safeParse({ status: 'approved' })
    expect(result.success).toBe(true)
  })

  it('accepts rejected status', () => {
    const result = updateLeaveStatusSchema.safeParse({ status: 'rejected' })
    expect(result.success).toBe(true)
  })

  it('rejects pending status', () => {
    const result = updateLeaveStatusSchema.safeParse({ status: 'pending' })
    expect(result.success).toBe(false)
  })

  it('rejects cancelled status', () => {
    const result = updateLeaveStatusSchema.safeParse({ status: 'cancelled' })
    expect(result.success).toBe(false)
  })

  it('rejects invalid status', () => {
    const result = updateLeaveStatusSchema.safeParse({ status: 'unknown' })
    expect(result.success).toBe(false)
  })

  it('rejects missing status', () => {
    const result = updateLeaveStatusSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})

describe('cancelLeaveSchema', () => {
  it('accepts cancelled status', () => {
    const result = cancelLeaveSchema.safeParse({ status: 'cancelled' })
    expect(result.success).toBe(true)
  })

  it('rejects other statuses', () => {
    const result = cancelLeaveSchema.safeParse({ status: 'approved' })
    expect(result.success).toBe(false)
  })
})

describe('createEmployeeSchema', () => {
  const validEmployee = {
    wallet_address: '0x1234567890abcdef1234567890abcdef12345678',
    name: 'Alice',
    start_date: '2026-01-15',
  }

  it('accepts valid employee data', () => {
    const result = createEmployeeSchema.safeParse(validEmployee)
    expect(result.success).toBe(true)
  })

  it('defaults role to employee', () => {
    const result = createEmployeeSchema.safeParse(validEmployee)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.role).toBe('employee')
    }
  })

  it('accepts admin role', () => {
    const result = createEmployeeSchema.safeParse({
      ...validEmployee,
      role: 'admin',
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid wallet address', () => {
    const result = createEmployeeSchema.safeParse({
      ...validEmployee,
      wallet_address: '0xinvalid',
    })
    expect(result.success).toBe(false)
  })

  it('rejects wallet address without 0x prefix', () => {
    const result = createEmployeeSchema.safeParse({
      ...validEmployee,
      wallet_address: '1234567890abcdef1234567890abcdef12345678',
    })
    expect(result.success).toBe(false)
  })

  it('rejects wallet address with wrong length', () => {
    const result = createEmployeeSchema.safeParse({
      ...validEmployee,
      wallet_address: '0x1234',
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty name', () => {
    const result = createEmployeeSchema.safeParse({
      ...validEmployee,
      name: '',
    })
    expect(result.success).toBe(false)
  })

  it('rejects name exceeding 200 characters', () => {
    const result = createEmployeeSchema.safeParse({
      ...validEmployee,
      name: 'x'.repeat(201),
    })
    expect(result.success).toBe(false)
  })

  it('accepts optional slack_user_id', () => {
    const result = createEmployeeSchema.safeParse({
      ...validEmployee,
      slack_user_id: 'U12345',
    })
    expect(result.success).toBe(true)
  })

  it('accepts null slack_user_id', () => {
    const result = createEmployeeSchema.safeParse({
      ...validEmployee,
      slack_user_id: null,
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid date format for start_date', () => {
    const result = createEmployeeSchema.safeParse({
      ...validEmployee,
      start_date: 'Jan 15, 2026',
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid role', () => {
    const result = createEmployeeSchema.safeParse({
      ...validEmployee,
      role: 'superadmin',
    })
    expect(result.success).toBe(false)
  })
})

describe('updateEmployeeSchema', () => {
  it('accepts partial updates with name only', () => {
    const result = updateEmployeeSchema.safeParse({ name: 'New Name' })
    expect(result.success).toBe(true)
  })

  it('accepts partial updates with role only', () => {
    const result = updateEmployeeSchema.safeParse({ role: 'admin' })
    expect(result.success).toBe(true)
  })

  it('accepts empty object (no changes)', () => {
    const result = updateEmployeeSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('rejects invalid wallet_address if provided', () => {
    const result = updateEmployeeSchema.safeParse({
      wallet_address: 'bad-address',
    })
    expect(result.success).toBe(false)
  })

  it('accepts valid wallet_address if provided', () => {
    const result = updateEmployeeSchema.safeParse({
      wallet_address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    })
    expect(result.success).toBe(true)
  })
})

describe('upsertPolicySchema', () => {
  it('accepts valid policy data', () => {
    const result = upsertPolicySchema.safeParse({
      leave_type: 'annual',
      total_days: 20,
    })
    expect(result.success).toBe(true)
  })

  it('accepts 0 total days', () => {
    const result = upsertPolicySchema.safeParse({
      leave_type: 'annual',
      total_days: 0,
    })
    expect(result.success).toBe(true)
  })

  it('accepts 365 total days', () => {
    const result = upsertPolicySchema.safeParse({
      leave_type: 'annual',
      total_days: 365,
    })
    expect(result.success).toBe(true)
  })

  it('accepts -1 as unlimited total days', () => {
    const result = upsertPolicySchema.safeParse({
      leave_type: 'annual',
      total_days: -1,
    })
    expect(result.success).toBe(true)
  })

  it('rejects total days below -1', () => {
    const result = upsertPolicySchema.safeParse({
      leave_type: 'annual',
      total_days: -2,
    })
    expect(result.success).toBe(false)
  })

  it('rejects more than 365 total days', () => {
    const result = upsertPolicySchema.safeParse({
      leave_type: 'annual',
      total_days: 366,
    })
    expect(result.success).toBe(false)
  })

  it('rejects non-integer total days', () => {
    const result = upsertPolicySchema.safeParse({
      leave_type: 'annual',
      total_days: 10.5,
    })
    expect(result.success).toBe(false)
  })

  it('accepts all leave types', () => {
    const types = ['annual', 'personal', 'sick', 'official', 'unpaid', 'remote', 'family_care', 'menstrual']
    for (const type of types) {
      const result = upsertPolicySchema.safeParse({
        leave_type: type,
        total_days: 10,
      })
      expect(result.success).toBe(true)
    }
  })

  it('accepts optional expires_at as datetime string', () => {
    const result = upsertPolicySchema.safeParse({
      leave_type: 'annual',
      total_days: 20,
      expires_at: '2027-01-01T00:00:00.000Z',
    })
    expect(result.success).toBe(true)
  })

  it('accepts null expires_at', () => {
    const result = upsertPolicySchema.safeParse({
      leave_type: 'annual',
      total_days: 20,
      expires_at: null,
    })
    expect(result.success).toBe(true)
  })
})
