import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  calculateWorkingDays,
  calculateAnniversaryPeriod,
  calculateTransitionPeriod,
  calculateFormalPeriod,
  getLeaveBalance,
  calculateWorkingDaysExcludingHolidays,
} from '@/lib/leave/balance'

// Mock the supabase queries module
vi.mock('@/lib/supabase/queries', () => ({
  getLeavePolicies: vi.fn(),
  getApprovedDaysInPeriod: vi.fn(),
  getPublicHolidayDatesInRange: vi.fn(),
}))

import {
  getLeavePolicies,
  getApprovedDaysInPeriod,
  getPublicHolidayDatesInRange,
} from '@/lib/supabase/queries'

const mockedGetLeavePolicies = vi.mocked(getLeavePolicies)
const mockedGetApprovedDaysInPeriod = vi.mocked(getApprovedDaysInPeriod)
const mockedGetPublicHolidayDatesInRange = vi.mocked(getPublicHolidayDatesInRange)

describe('calculateWorkingDays', () => {
  it('returns 0 when end date is before start date', () => {
    expect(calculateWorkingDays('2026-03-20', '2026-03-19')).toBe(0)
  })

  it('returns 1 for a single weekday (Monday)', () => {
    // 2026-03-23 is a Monday
    expect(calculateWorkingDays('2026-03-23', '2026-03-23')).toBe(1)
  })

  it('returns 1 for a single weekday (Friday)', () => {
    // 2026-03-27 is a Friday
    expect(calculateWorkingDays('2026-03-27', '2026-03-27')).toBe(1)
  })

  it('returns 0 for a single Saturday', () => {
    // 2026-03-21 is a Saturday
    expect(calculateWorkingDays('2026-03-21', '2026-03-21')).toBe(0)
  })

  it('returns 0 for a single Sunday', () => {
    // 2026-03-22 is a Sunday
    expect(calculateWorkingDays('2026-03-22', '2026-03-22')).toBe(0)
  })

  it('returns 0 for a Saturday-Sunday range', () => {
    expect(calculateWorkingDays('2026-03-21', '2026-03-22')).toBe(0)
  })

  it('counts 5 working days in a full Mon-Fri week', () => {
    // 2026-03-23 (Mon) to 2026-03-27 (Fri)
    expect(calculateWorkingDays('2026-03-23', '2026-03-27')).toBe(5)
  })

  it('counts working days across a weekend', () => {
    // 2026-03-20 (Fri) to 2026-03-23 (Mon) = Fri + Mon = 2
    expect(calculateWorkingDays('2026-03-20', '2026-03-23')).toBe(2)
  })

  it('counts 5 working days in a full calendar week (Mon-Sun)', () => {
    // 2026-03-23 (Mon) to 2026-03-29 (Sun) = Mon-Fri = 5
    expect(calculateWorkingDays('2026-03-23', '2026-03-29')).toBe(5)
  })

  it('counts working days in a two-week span', () => {
    // 2026-03-23 (Mon) to 2026-04-03 (Fri) = 10 working days
    expect(calculateWorkingDays('2026-03-23', '2026-04-03')).toBe(10)
  })

  it('handles cross-month ranges correctly', () => {
    // 2026-03-30 (Mon) to 2026-04-03 (Fri) = 5 working days
    expect(calculateWorkingDays('2026-03-30', '2026-04-03')).toBe(5)
  })

  it('handles cross-year ranges correctly', () => {
    // 2025-12-29 (Mon) to 2026-01-02 (Fri) = 5 working days
    expect(calculateWorkingDays('2025-12-29', '2026-01-02')).toBe(5)
  })

  it('counts working days for a full month (March 2026)', () => {
    // March 2026: starts on Sunday, ends on Tuesday
    expect(calculateWorkingDays('2026-03-01', '2026-03-31')).toBe(22)
  })

  it('counts working days for a longer range', () => {
    // Two full weeks: 2026-04-06 (Mon) to 2026-04-17 (Fri) = 10 working days
    expect(calculateWorkingDays('2026-04-06', '2026-04-17')).toBe(10)
  })

  it('excludes public holidays when provided', () => {
    // 2026-03-23 (Mon) to 2026-03-27 (Fri) = 5 working days normally
    // But with 2026-03-25 (Wed) as a holiday, should be 4
    const holidays = new Set(['2026-03-25'])
    expect(calculateWorkingDays('2026-03-23', '2026-03-27', holidays)).toBe(4)
  })

  it('ignores holidays that fall on weekends', () => {
    // 2026-03-23 (Mon) to 2026-03-27 (Fri) = 5 working days
    // Holiday on Saturday 2026-03-21 should not affect the count
    const holidays = new Set(['2026-03-21'])
    expect(calculateWorkingDays('2026-03-23', '2026-03-27', holidays)).toBe(5)
  })

  it('excludes multiple holidays', () => {
    // 2026-03-23 (Mon) to 2026-03-27 (Fri) = 5 working days
    // With Mon and Fri as holidays, should be 3
    const holidays = new Set(['2026-03-23', '2026-03-27'])
    expect(calculateWorkingDays('2026-03-23', '2026-03-27', holidays)).toBe(3)
  })

  it('works without holidayDates parameter (undefined)', () => {
    expect(calculateWorkingDays('2026-03-23', '2026-03-27')).toBe(5)
  })
})

describe('calculateWorkingDaysExcludingHolidays', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches holidays and excludes them from working days count', async () => {
    mockedGetPublicHolidayDatesInRange.mockResolvedValue(['2026-03-25'])

    const days = await calculateWorkingDaysExcludingHolidays('2026-03-23', '2026-03-27')
    expect(days).toBe(4) // 5 weekdays - 1 holiday
    expect(mockedGetPublicHolidayDatesInRange).toHaveBeenCalledWith('2026-03-23', '2026-03-27')
  })

  it('returns full count when no holidays', async () => {
    mockedGetPublicHolidayDatesInRange.mockResolvedValue([])

    const days = await calculateWorkingDaysExcludingHolidays('2026-03-23', '2026-03-27')
    expect(days).toBe(5)
  })
})

describe('calculateAnniversaryPeriod', () => {
  it('returns the correct period when reference date is after the anniversary', () => {
    // Employee started 2024-01-15, reference 2026-03-20
    // Anniversary period: 2026-01-15 to 2027-01-14
    const result = calculateAnniversaryPeriod('2024-01-15', '2026-03-20')
    expect(result.periodStart).toBe('2026-01-15')
    expect(result.periodEnd).toBe('2027-01-14')
  })

  it('returns the correct period when reference date is before the anniversary this year', () => {
    // Employee started 2024-06-01, reference 2026-03-20
    // Anniversary this year is 2026-06-01 which is after reference
    // So period: 2025-06-01 to 2026-05-31
    const result = calculateAnniversaryPeriod('2024-06-01', '2026-03-20')
    expect(result.periodStart).toBe('2025-06-01')
    expect(result.periodEnd).toBe('2026-05-31')
  })

  it('returns the correct period when reference date is on the anniversary', () => {
    // Employee started 2024-03-20, reference 2026-03-20
    // Anniversary this year is 2026-03-20, which is equal to reference
    // So period: 2026-03-20 to 2027-03-19
    const result = calculateAnniversaryPeriod('2024-03-20', '2026-03-20')
    expect(result.periodStart).toBe('2026-03-20')
    expect(result.periodEnd).toBe('2027-03-19')
  })

  it('handles first-year employees', () => {
    // Employee started 2026-01-10, reference 2026-03-20
    // Anniversary this year is 2026-01-10, which is before reference
    // So period: 2026-01-10 to 2027-01-09
    const result = calculateAnniversaryPeriod('2026-01-10', '2026-03-20')
    expect(result.periodStart).toBe('2026-01-10')
    expect(result.periodEnd).toBe('2027-01-09')
  })

  it('handles year-end start dates', () => {
    // Employee started 2024-12-15, reference 2026-03-20
    // Anniversary this year would be 2026-12-15, which is after reference
    // So period: 2025-12-15 to 2026-12-14
    const result = calculateAnniversaryPeriod('2024-12-15', '2026-03-20')
    expect(result.periodStart).toBe('2025-12-15')
    expect(result.periodEnd).toBe('2026-12-14')
  })

  it('uses current date as default reference if none provided', () => {
    const result = calculateAnniversaryPeriod('2024-01-15')
    expect(result.periodStart).toBeDefined()
    expect(result.periodEnd).toBeDefined()
    const start = new Date(result.periodStart)
    const end = new Date(result.periodEnd)
    const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
    // One year minus one day (364 or 365 depending on leap year)
    expect(diffDays).toBeGreaterThanOrEqual(364)
    expect(diffDays).toBeLessThanOrEqual(365)
  })
})

describe('getLeaveBalance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns correct balance when policy exists', async () => {
    mockedGetLeavePolicies.mockResolvedValue([
      {
        id: 'p1',
        employee_id: 'emp-001',
        leave_type: 'annual',
        total_days: 20,
        expires_at: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
    ])
    mockedGetApprovedDaysInPeriod.mockResolvedValue(5)

    const balance = await getLeaveBalance('emp-001', 'annual', '2024-01-15')

    expect(balance.leave_type).toBe('annual')
    expect(balance.total_days).toBe(20)
    expect(balance.used_days).toBe(5)
    expect(balance.remaining_days).toBe(15)
  })

  it('returns 0 total days when no policy matches', async () => {
    mockedGetLeavePolicies.mockResolvedValue([])
    mockedGetApprovedDaysInPeriod.mockResolvedValue(0)

    const balance = await getLeaveBalance('emp-001', 'sick', '2024-01-15')

    expect(balance.total_days).toBe(0)
    expect(balance.used_days).toBe(0)
    expect(balance.remaining_days).toBe(0)
  })

  it('returns negative remaining when used exceeds total', async () => {
    mockedGetLeavePolicies.mockResolvedValue([
      {
        id: 'p1',
        employee_id: 'emp-001',
        leave_type: 'annual',
        total_days: 5,
        expires_at: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
    ])
    mockedGetApprovedDaysInPeriod.mockResolvedValue(7)

    const balance = await getLeaveBalance('emp-001', 'annual', '2024-01-15')

    expect(balance.remaining_days).toBe(-2)
  })

  it('finds the right policy among multiple leave types', async () => {
    mockedGetLeavePolicies.mockResolvedValue([
      {
        id: 'p1',
        employee_id: 'emp-001',
        leave_type: 'annual',
        total_days: 20,
        expires_at: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
      {
        id: 'p2',
        employee_id: 'emp-001',
        leave_type: 'sick',
        total_days: 10,
        expires_at: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
    ])
    mockedGetApprovedDaysInPeriod.mockResolvedValue(3)

    const balance = await getLeaveBalance('emp-001', 'sick', '2024-01-15')

    expect(balance.leave_type).toBe('sick')
    expect(balance.total_days).toBe(10)
    expect(balance.used_days).toBe(3)
    expect(balance.remaining_days).toBe(7)
  })

  it('passes correct period to getApprovedDaysInPeriod', async () => {
    mockedGetLeavePolicies.mockResolvedValue([])
    mockedGetApprovedDaysInPeriod.mockResolvedValue(0)

    await getLeaveBalance('emp-001', 'annual', '2024-01-15')

    expect(mockedGetApprovedDaysInPeriod).toHaveBeenCalledWith(
      'emp-001',
      'annual',
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    )
  })
})

describe('calculateTransitionPeriod', () => {
  it('returns 2026-01-01 to day before next anniversary (3/1 start)', () => {
    const result = calculateTransitionPeriod('2023-03-01')
    expect(result.periodStart).toBe('2026-01-01')
    expect(result.periodEnd).toBe('2026-02-28')
  })

  it('returns 2026-01-01 to day before next anniversary (6/1 start)', () => {
    const result = calculateTransitionPeriod('2024-06-01')
    expect(result.periodStart).toBe('2026-01-01')
    expect(result.periodEnd).toBe('2026-05-31')
  })

  it('handles 1/1 start date (anniversary on switch date)', () => {
    const result = calculateTransitionPeriod('2024-01-01')
    expect(result.periodStart).toBe('2026-01-01')
    // Next anniversary after 2026-01-01 is 2027-01-01
    expect(result.periodEnd).toBe('2026-12-31')
  })
})

describe('calculateFormalPeriod', () => {
  it('starts the day after transition ends (3/1 start)', () => {
    const result = calculateFormalPeriod('2023-03-01')
    expect(result.periodStart).toBe('2026-03-01')
    expect(result.periodEnd).toBe('2027-02-28')
  })

  it('starts the day after transition ends (6/1 start)', () => {
    const result = calculateFormalPeriod('2024-06-01')
    expect(result.periodStart).toBe('2026-06-01')
    expect(result.periodEnd).toBe('2027-05-31')
  })
})

describe('getLeaveBalance with transition', () => {
  const annualPolicy = {
    id: 'p1', employee_id: 'emp-001', leave_type: 'annual' as const,
    total_days: 27, expires_at: null,
    created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockedGetLeavePolicies.mockResolvedValue([annualPolicy])
    // Use fake timers to control "today"
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('scenario 1: 6 days in transition, overflow 1 to formal', async () => {
    // 3/1 start, transition 5 days, during transition period
    vi.setSystemTime(new Date('2026-01-20'))

    // transition period query returns 6 (used more than quota)
    // formal period query returns 0
    mockedGetApprovedDaysInPeriod
      .mockResolvedValueOnce(6)  // transition period
      .mockResolvedValueOnce(0)  // formal period

    const balance = await getLeaveBalance('emp-001', 'annual', '2023-03-01', 5)

    expect(balance.transition_days).toBe(5)
    expect(balance.transition_used_days).toBe(5) // capped at quota
    expect(balance.used_days).toBe(1) // overflow
    expect(balance.remaining_days).toBe(26) // 27 - 1
  })

  it('scenario 2: 3 days in transition, no overflow', async () => {
    vi.setSystemTime(new Date('2026-01-20'))

    mockedGetApprovedDaysInPeriod
      .mockResolvedValueOnce(3)  // transition period
      .mockResolvedValueOnce(0)  // formal period

    const balance = await getLeaveBalance('emp-001', 'annual', '2023-03-01', 5)

    expect(balance.transition_days).toBe(5)
    expect(balance.transition_used_days).toBe(3)
    expect(balance.used_days).toBe(0)
    expect(balance.remaining_days).toBe(27)
  })

  it('scenario 3: cross-boundary leave, start_date in transition', async () => {
    vi.setSystemTime(new Date('2026-02-27'))

    // Leave start_date is in transition → counted in transition query
    mockedGetApprovedDaysInPeriod
      .mockResolvedValueOnce(3)  // transition period (full 3 days)
      .mockResolvedValueOnce(0)  // formal period

    const balance = await getLeaveBalance('emp-001', 'annual', '2023-03-01', 5)

    expect(balance.transition_days).toBe(5)
    expect(balance.transition_used_days).toBe(3)
    expect(balance.used_days).toBe(0)
    expect(balance.remaining_days).toBe(27)
  })

  it('scenario 4: after transition expired, transition hidden', async () => {
    vi.setSystemTime(new Date('2026-04-01'))

    mockedGetApprovedDaysInPeriod
      .mockResolvedValueOnce(0)  // transition period (no leave taken)
      .mockResolvedValueOnce(5)  // formal period

    const balance = await getLeaveBalance('emp-001', 'annual', '2023-03-01', 5)

    // Transition expired → null (hidden in UI)
    expect(balance.transition_days).toBeNull()
    expect(balance.transition_used_days).toBeNull()
    expect(balance.used_days).toBe(5)
    expect(balance.remaining_days).toBe(22)
  })

  it('non-annual leave type ignores transition even if set', async () => {
    vi.setSystemTime(new Date('2026-01-20'))

    mockedGetLeavePolicies.mockResolvedValue([{
      ...annualPolicy, leave_type: 'sick', total_days: 10,
    }])
    mockedGetApprovedDaysInPeriod.mockResolvedValue(2)

    const balance = await getLeaveBalance('emp-001', 'sick', '2023-03-01', 5)

    expect(balance.transition_days).toBeNull()
    expect(balance.transition_used_days).toBeNull()
  })

  it('no transition days → standard anniversary logic', async () => {
    vi.setSystemTime(new Date('2026-01-20'))
    mockedGetApprovedDaysInPeriod.mockResolvedValue(3)

    const balance = await getLeaveBalance('emp-001', 'annual', '2023-03-01')

    expect(balance.transition_days).toBeNull()
    expect(balance.transition_used_days).toBeNull()
    expect(balance.used_days).toBe(3)
    expect(balance.remaining_days).toBe(24)
  })
})
