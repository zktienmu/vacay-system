import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockLeaveRequest } from '@/__tests__/helpers/mocks'

// vi.hoisted runs before module evaluation.
// Set env vars here so calendar.ts evaluates isConfigured as true.
const { mockEventsInsert, mockEventsDelete } = vi.hoisted(() => {
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'test@test.iam.gserviceaccount.com'
  process.env.GOOGLE_PRIVATE_KEY = 'fake-private-key'
  process.env.GOOGLE_CALENDAR_ID = 'cal-123@group.calendar.google.com'
  return {
    mockEventsInsert: vi.fn(),
    mockEventsDelete: vi.fn(),
  }
})

vi.mock('@googleapis/calendar', () => ({
  calendar: vi.fn().mockReturnValue({
    events: {
      insert: mockEventsInsert,
      delete: mockEventsDelete,
    },
  }),
}))

vi.mock('google-auth-library', () => ({
  JWT: vi.fn(),
}))

import {
  createLeaveEvent,
  deleteLeaveEvent,
  getLeaveTypeEmoji,
} from '@/lib/google/calendar'

describe('createLeaveEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates an all-day event and returns the event ID', async () => {
    mockEventsInsert.mockResolvedValueOnce({
      data: { id: 'gcal-event-123' },
    })

    const request = mockLeaveRequest({
      leave_type: 'annual',
      start_date: '2026-04-01',
      end_date: '2026-04-03',
      days: 3,
      notes: 'Vacation',
    })

    const eventId = await createLeaveEvent(request, 'Alice')

    expect(eventId).toBe('gcal-event-123')
    expect(mockEventsInsert).toHaveBeenCalledTimes(1)

    const insertCall = mockEventsInsert.mock.calls[0][0]
    expect(insertCall.calendarId).toBe('cal-123@group.calendar.google.com')
    expect(insertCall.requestBody.summary).toBe('Alice 3 Days-Off')
    expect(insertCall.requestBody.start.date).toBe('2026-04-01')
    // End date is exclusive (end_date + 1 day), weekdays only
    expect(insertCall.requestBody.end.date).toBe('2026-04-04')
    expect(insertCall.requestBody.description).toBe('Vacation')
    expect(insertCall.requestBody.transparency).toBe('transparent')
  })

  it('uses "Day-Off" for single-day leave', async () => {
    mockEventsInsert.mockResolvedValueOnce({
      data: { id: 'gcal-event-single' },
    })

    const request = mockLeaveRequest({
      leave_type: 'personal',
      start_date: '2026-04-01',
      end_date: '2026-04-01',
      days: 1,
    })

    await createLeaveEvent(request, 'Bob')

    const insertCall = mockEventsInsert.mock.calls[0][0]
    expect(insertCall.requestBody.summary).toBe('Bob Day-Off')
  })

  it('uses "Remote" summary with notes for remote leave type', async () => {
    mockEventsInsert.mockResolvedValueOnce({
      data: { id: 'gcal-event-remote' },
    })

    const request = mockLeaveRequest({
      leave_type: 'remote',
      start_date: '2026-04-01',
      end_date: '2026-04-01',
      days: 1,
      notes: 'Working from home',
    })

    await createLeaveEvent(request, 'Carol')

    const insertCall = mockEventsInsert.mock.calls[0][0]
    expect(insertCall.requestBody.summary).toBe('Carol Remote \u2014 Working from home')
  })

  it('uses "Remote" summary without notes when notes is null', async () => {
    mockEventsInsert.mockResolvedValueOnce({
      data: { id: 'gcal-event-remote-no-notes' },
    })

    const request = mockLeaveRequest({
      leave_type: 'remote',
      start_date: '2026-04-01',
      end_date: '2026-04-01',
      days: 1,
      notes: null,
    })

    await createLeaveEvent(request, 'Dave')

    const insertCall = mockEventsInsert.mock.calls[0][0]
    expect(insertCall.requestBody.summary).toBe('Dave Remote')
  })

  it('sets description to undefined when notes is null', async () => {
    mockEventsInsert.mockResolvedValueOnce({
      data: { id: 'gcal-no-notes' },
    })

    const request = mockLeaveRequest({ notes: null })

    await createLeaveEvent(request, 'Eve')

    const insertCall = mockEventsInsert.mock.calls[0][0]
    expect(insertCall.requestBody.description).toBeUndefined()
  })

  it('returns null and does not throw on API error', async () => {
    mockEventsInsert.mockRejectedValueOnce(new Error('Google API error'))

    const request = mockLeaveRequest()
    const result = await createLeaveEvent(request, 'Alice')

    expect(result).toBeNull()
  })

  it('returns null when API returns no event ID', async () => {
    mockEventsInsert.mockResolvedValueOnce({
      data: { id: undefined },
    })

    const request = mockLeaveRequest()
    const result = await createLeaveEvent(request, 'Alice')

    expect(result).toBeNull()
  })
})

describe('deleteLeaveEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deletes the event by ID', async () => {
    mockEventsDelete.mockResolvedValueOnce({})

    await deleteLeaveEvent('gcal-event-123')

    expect(mockEventsDelete).toHaveBeenCalledTimes(1)
    expect(mockEventsDelete).toHaveBeenCalledWith({
      calendarId: 'cal-123@group.calendar.google.com',
      eventId: 'gcal-event-123',
    })
  })

  it('does not throw on API error', async () => {
    mockEventsDelete.mockRejectedValueOnce(new Error('Delete failed'))

    await expect(deleteLeaveEvent('gcal-event-123')).resolves.toBeUndefined()
  })
})

describe('getLeaveTypeEmoji', () => {
  it('returns correct emoji for each leave type', () => {
    expect(getLeaveTypeEmoji('annual')).toBe('\u{1F334}')
    expect(getLeaveTypeEmoji('personal')).toBe('\u{1F464}')
    expect(getLeaveTypeEmoji('sick')).toBe('\u{1F3E5}')
    expect(getLeaveTypeEmoji('official')).toBe('\u{1F4BC}')
    expect(getLeaveTypeEmoji('unpaid')).toBe('\u{1F4CB}')
    expect(getLeaveTypeEmoji('remote')).toBe('\u{1F3E0}')
  })
})
