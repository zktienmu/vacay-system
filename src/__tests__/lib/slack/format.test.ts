import { describe, it, expect, vi } from 'vitest'

import {
  formatLeaveType,
  formatDate,
  formatDateRange,
  buildNewRequestBlocks,
  buildApprovedBlocks,
  buildRejectedBlocks,
} from '@/lib/slack/format'
import { mockEmployee, mockLeaveRequest } from '@/__tests__/helpers/mocks'

describe('formatLeaveType', () => {
  it('returns "Annual Leave" for annual', () => {
    expect(formatLeaveType('annual')).toBe('Annual Leave')
  })

  it('returns "Personal Leave" for personal', () => {
    expect(formatLeaveType('personal')).toBe('Personal Leave')
  })

  it('returns "Sick Leave" for sick', () => {
    expect(formatLeaveType('sick')).toBe('Sick Leave')
  })

  it('returns "Official Leave" for official', () => {
    expect(formatLeaveType('official')).toBe('Official Leave')
  })

  it('returns "Unpaid Leave" for unpaid', () => {
    expect(formatLeaveType('unpaid')).toBe('Unpaid Leave')
  })

  it('returns "Remote Work" for remote', () => {
    expect(formatLeaveType('remote')).toBe('Remote Work')
  })
})

describe('formatDate', () => {
  it('formats ISO date to readable format', () => {
    expect(formatDate('2026-03-13')).toBe('Mar 13, 2026')
  })

  it('formats January date correctly', () => {
    expect(formatDate('2026-01-01')).toBe('Jan 1, 2026')
  })

  it('formats December date correctly', () => {
    expect(formatDate('2026-12-31')).toBe('Dec 31, 2026')
  })
})

describe('formatDateRange', () => {
  it('formats a date range with arrow separator', () => {
    const result = formatDateRange('2026-03-13', '2026-03-15')
    expect(result).toBe('Mar 13, 2026 \u2192 Mar 15, 2026')
  })

  it('handles same-day range', () => {
    const result = formatDateRange('2026-04-01', '2026-04-01')
    expect(result).toBe('Apr 1, 2026 \u2192 Apr 1, 2026')
  })

  it('handles cross-year range', () => {
    const result = formatDateRange('2025-12-29', '2026-01-02')
    expect(result).toBe('Dec 29, 2025 \u2192 Jan 2, 2026')
  })
})

describe('buildNewRequestBlocks', () => {
  it('returns blocks with header, employee info, date range, and review button', () => {
    const request = mockLeaveRequest({
      id: 'lr-100',
      leave_type: 'annual',
      start_date: '2026-04-01',
      end_date: '2026-04-03',
      days: 3,
      notes: 'Family vacation',
    })
    const employee = mockEmployee({ name: 'Alice' })
    const blocks = buildNewRequestBlocks(request, employee, 'https://vaca.app')

    // Should have 4 blocks: header, section (employee), section (fields), actions
    expect(blocks).toHaveLength(4)

    // Header block
    expect(blocks[0]).toMatchObject({
      type: 'header',
      text: { type: 'plain_text' },
    })

    // Employee section mentions the name and leave type
    const employeeSection = blocks[1] as { type: string; text: { text: string } }
    expect(employeeSection.text.text).toContain('Alice')
    expect(employeeSection.text.text).toContain('Annual Leave')

    // Fields section contains date range and notes
    const fieldsSection = blocks[2] as { type: string; fields: { text: string }[] }
    expect(fieldsSection.fields[0].text).toContain('3')
    expect(fieldsSection.fields[1].text).toContain('Family vacation')

    // Actions block has a review button with correct URL
    const actionsBlock = blocks[3] as { type: string; elements: { url: string }[] }
    expect(actionsBlock.type).toBe('actions')
    expect(actionsBlock.elements[0].url).toBe('https://vaca.app/admin/review/lr-100')
  })

  it('shows "No notes" when notes are null', () => {
    const request = mockLeaveRequest({ notes: null })
    const employee = mockEmployee()
    const blocks = buildNewRequestBlocks(request, employee, 'https://vaca.app')

    const fieldsSection = blocks[2] as { type: string; fields: { text: string }[] }
    expect(fieldsSection.fields[1].text).toContain('No notes')
  })

  it('shows singular "day" for 1-day requests', () => {
    const request = mockLeaveRequest({ days: 1 })
    const employee = mockEmployee()
    const blocks = buildNewRequestBlocks(request, employee, 'https://vaca.app')

    const fieldsSection = blocks[2] as { type: string; fields: { text: string }[] }
    expect(fieldsSection.fields[0].text).toContain('*1* day)')
  })

  it('shows plural "days" for multi-day requests', () => {
    const request = mockLeaveRequest({ days: 5 })
    const employee = mockEmployee()
    const blocks = buildNewRequestBlocks(request, employee, 'https://vaca.app')

    const fieldsSection = blocks[2] as { type: string; fields: { text: string }[] }
    expect(fieldsSection.fields[0].text).toContain('*5* days)')
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

    // Should have 3 blocks: header, section (employee), section (date)
    expect(blocks).toHaveLength(3)

    // Header
    const header = blocks[0] as { text: { text: string } }
    expect(header.text.text).toContain('Approved')

    // Employee section
    const section = blocks[1] as { text: { text: string } }
    expect(section.text.text).toContain('Bob')
    expect(section.text.text).toContain('Sick Leave')
  })
})

describe('buildRejectedBlocks', () => {
  it('returns blocks with rejection header and request info', () => {
    const request = mockLeaveRequest({
      leave_type: 'personal',
      start_date: '2026-05-01',
      end_date: '2026-05-02',
    })
    const blocks = buildRejectedBlocks(request)

    // Should have 2 blocks: header, section
    expect(blocks).toHaveLength(2)

    // Header
    const header = blocks[0] as { text: { text: string } }
    expect(header.text.text).toContain('Rejected')

    // Section mentions the leave type and date range
    const section = blocks[1] as { text: { text: string } }
    expect(section.text.text).toContain('Personal Leave')
    expect(section.text.text).toContain('May 1, 2026')
    expect(section.text.text).toContain('May 2, 2026')
  })
})
