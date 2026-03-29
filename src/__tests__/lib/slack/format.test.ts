import { describe, it, expect, vi } from 'vitest'

import {
  formatLeaveType,
  formatDate,
  formatDateRange,
  formatShortDates,
  buildNewRequestBlocks,
  buildApprovedBlocks,
  buildRejectedBlocks,
  buildCancelledBlocks,
} from '@/lib/slack/format'
import { mockEmployee, mockLeaveRequest } from '@/__tests__/helpers/mocks'

describe('formatLeaveType', () => {
  it('returns Chinese label for annual', () => {
    expect(formatLeaveType('annual')).toBe('特休')
  })

  it('returns Chinese label for personal', () => {
    expect(formatLeaveType('personal')).toBe('事假')
  })

  it('returns Chinese label for sick', () => {
    expect(formatLeaveType('sick')).toBe('病假')
  })



  it('returns Chinese label for remote', () => {
    expect(formatLeaveType('remote')).toBe('遠端工作')
  })
})

describe('formatDate', () => {
  it('formats ISO date to yyyy/MM/dd', () => {
    expect(formatDate('2026-03-13')).toBe('2026/03/13')
  })

  it('formats January date correctly', () => {
    expect(formatDate('2026-01-01')).toBe('2026/01/01')
  })

  it('formats December date correctly', () => {
    expect(formatDate('2026-12-31')).toBe('2026/12/31')
  })
})

describe('formatDateRange', () => {
  it('formats a multi-day range with tilde separator', () => {
    const result = formatDateRange('2026-03-13', '2026-03-15')
    expect(result).toBe('2026/03/13 ~ 2026/03/15')
  })

  it('shows single date for same-day range', () => {
    const result = formatDateRange('2026-04-01', '2026-04-01')
    expect(result).toBe('2026/04/01')
  })

  it('handles cross-year range', () => {
    const result = formatDateRange('2025-12-29', '2026-01-02')
    expect(result).toBe('2025/12/29 ~ 2026/01/02')
  })
})

describe('formatShortDates', () => {
  it('formats single date to M/d', () => {
    expect(formatShortDates(['2026-03-03'])).toBe('3/3')
  })

  it('formats multiple dates comma-separated', () => {
    expect(formatShortDates(['2026-03-03', '2026-03-04'])).toBe('3/3, 3/4')
  })

  it('handles dates in different months', () => {
    expect(formatShortDates(['2026-01-15', '2026-02-01', '2026-12-31'])).toBe('1/15, 2/1, 12/31')
  })

  it('returns empty string for empty array', () => {
    expect(formatShortDates([])).toBe('')
  })
})

describe('buildNewRequestBlocks', () => {
  it('returns blocks with header, employee info, details, and review button', () => {
    const request = mockLeaveRequest({
      id: 'lr-100',
      leave_type: 'annual',
      start_date: '2026-04-01',
      end_date: '2026-04-03',
      days: 3,
      notes: 'Family vacation',
      handover_url: 'https://docs.google.com/handover',
    })
    const employee = mockEmployee({ name: 'Alice' })
    const blocks = buildNewRequestBlocks(request, employee, 'https://vaca-blond.vercel.app')

    expect(blocks).toHaveLength(4)

    // Header
    const header = blocks[0] as { text: { text: string } }
    expect(header.text.text).toContain('新假期申請')

    // Employee section mentions the name and leave type
    const employeeSection = blocks[1] as { text: { text: string } }
    expect(employeeSection.text.text).toContain('Alice')
    expect(employeeSection.text.text).toContain('特休')

    // Fields section contains date, notes, and handover
    const fieldsSection = blocks[2] as { type: string; fields: { text: string }[] }
    expect(fieldsSection.fields[0].text).toContain('3 天')
    expect(fieldsSection.fields[1].text).toContain('Family vacation')
    expect(fieldsSection.fields[2].text).toContain('交接事項')

    // Section block has a review link with correct URL
    const reviewBlock = blocks[3] as { type: string; text: { text: string } }
    expect(reviewBlock.type).toBe('section')
    expect(reviewBlock.text.text).toContain('https://vaca-blond.vercel.app/admin/review/lr-100')
  })

  it('omits notes and handover fields when null', () => {
    const request = mockLeaveRequest({ notes: null, handover_url: null })
    const employee = mockEmployee()
    const blocks = buildNewRequestBlocks(request, employee, 'https://vaca-blond.vercel.app')

    const fieldsSection = blocks[2] as { type: string; fields: { text: string }[] }
    // Only date field
    expect(fieldsSection.fields).toHaveLength(1)
  })
})

describe('buildApprovedBlocks', () => {
  it('returns blocks with approval header and employee info', () => {
    const request = mockLeaveRequest({
      leave_type: 'sick',
      start_date: '2026-04-10',
      end_date: '2026-04-11',
      days: 2,
    })
    const employee = mockEmployee({ name: 'Bob' })
    const blocks = buildApprovedBlocks(request, employee)

    expect(blocks).toHaveLength(3)

    const header = blocks[0] as { text: { text: string } }
    expect(header.text.text).toContain('已核准')

    const section = blocks[1] as { text: { text: string } }
    expect(section.text.text).toContain('Bob')
    expect(section.text.text).toContain('病假')
  })

  it('includes delegate names and handover info (legacy fallback)', () => {
    const request = mockLeaveRequest({
      handover_url: 'https://docs.google.com/handover',
      notes: 'Please check email',
    })
    const employee = mockEmployee({ name: 'Alice' })
    const blocks = buildApprovedBlocks(request, employee, ['Bob', 'Carol'])

    const details = blocks[2] as { text: { text: string } }
    expect(details.text.text).toContain('Bob、Carol')
    expect(details.text.text).toContain('交接事項')
    expect(details.text.text).toContain('Please check email')
  })

  it('includes per-delegate assignment details when resolvedAssignments provided', () => {
    const request = mockLeaveRequest({
      start_date: '2026-03-03',
      end_date: '2026-03-05',
      days: 3,
    })
    const employee = mockEmployee({ name: 'Alice' })
    const resolvedAssignments = [
      { name: 'Bob', dates: ['2026-03-03', '2026-03-04'], handover_note: '處理客戶 X 的 ticket' },
      { name: 'Carol', dates: ['2026-03-05'], handover_note: 'Review PR #123' },
    ]
    const blocks = buildApprovedBlocks(request, employee, ['Bob', 'Carol'], resolvedAssignments)

    const details = blocks[2] as { text: { text: string } }
    expect(details.text.text).toContain('代理安排')
    expect(details.text.text).toContain('Bob (3/3, 3/4)：處理客戶 X 的 ticket')
    expect(details.text.text).toContain('Carol (3/5)：Review PR #123')
    // Should NOT contain the simple delegate names line when assignments are present
    expect(details.text.text).not.toContain('代理人')
  })

  it('falls back to delegate names when resolvedAssignments is empty', () => {
    const request = mockLeaveRequest()
    const employee = mockEmployee({ name: 'Alice' })
    const blocks = buildApprovedBlocks(request, employee, ['Bob'], [])

    const details = blocks[2] as { text: { text: string } }
    expect(details.text.text).toContain('代理人：Bob')
    expect(details.text.text).not.toContain('代理安排')
  })

  it('omits handover note in assignment line when null', () => {
    const request = mockLeaveRequest({
      start_date: '2026-03-03',
      end_date: '2026-03-03',
      days: 1,
    })
    const employee = mockEmployee({ name: 'Alice' })
    const resolvedAssignments = [
      { name: 'Bob', dates: ['2026-03-03'], handover_note: null },
    ]
    const blocks = buildApprovedBlocks(request, employee, ['Bob'], resolvedAssignments)

    const details = blocks[2] as { text: { text: string } }
    expect(details.text.text).toContain('Bob (3/3)')
    // The Bob line should end after (3/3) without a colon — no handover note appended
    expect(details.text.text).toMatch(/Bob \(3\/3\)\n|Bob \(3\/3\)$/)
  })
})

describe('buildRejectedBlocks', () => {
  it('returns blocks with rejection header and request info', () => {
    const request = mockLeaveRequest({
      leave_type: 'personal',
      start_date: '2026-05-01',
      end_date: '2026-05-02',
    })
    const employee = mockEmployee({ name: 'Alice' })
    const blocks = buildRejectedBlocks(request, employee)

    expect(blocks).toHaveLength(2)

    const header = blocks[0] as { text: { text: string } }
    expect(header.text.text).toContain('已駁回')

    const section = blocks[1] as { text: { text: string } }
    expect(section.text.text).toContain('事假')
    expect(section.text.text).toContain('Alice')
  })
})

describe('buildCancelledBlocks', () => {
  it('returns blocks with cancellation header and info', () => {
    const request = mockLeaveRequest({
      leave_type: 'annual',
      start_date: '2026-04-01',
      end_date: '2026-04-03',
      days: 3,
    })
    const employee = mockEmployee({ name: 'Alice' })
    const blocks = buildCancelledBlocks(request, employee)

    expect(blocks).toHaveLength(2)

    const header = blocks[0] as { text: { text: string } }
    expect(header.text.text).toContain('已取消')

    const section = blocks[1] as { text: { text: string } }
    expect(section.text.text).toContain('Alice')
    expect(section.text.text).toContain('特休')
    expect(section.text.text).toContain('3 天')
  })
})
