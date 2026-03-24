import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockEmployee, mockLeaveRequest } from '@/__tests__/helpers/mocks'

// vi.hoisted runs before anything else, including module evaluation.
// We set env vars here so that when notify.ts loads and checks
// process.env.SLACK_BOT_TOKEN, it finds a truthy value and instantiates WebClient.
const { mockPostMessage } = vi.hoisted(() => {
  process.env.SLACK_BOT_TOKEN = 'xoxb-test-token'
  process.env.SLACK_LEAVE_CHANNEL_ID = 'C-leave-channel'
  process.env.NEXT_PUBLIC_APP_URL = 'https://vaca.test'
  return {
    mockPostMessage: vi.fn().mockResolvedValue({ ok: true }),
  }
})

vi.mock('@slack/web-api', () => {
  class MockWebClient {
    chat = { postMessage: mockPostMessage }
  }
  return { WebClient: MockWebClient }
})

vi.mock('@/lib/slack/format', () => ({
  buildNewRequestBlocks: vi.fn().mockReturnValue([{ type: 'section', text: { type: 'mrkdwn', text: 'new-request' } }]),
  buildApprovedBlocks: vi.fn().mockReturnValue([{ type: 'section', text: { type: 'mrkdwn', text: 'approved' } }]),
  buildRejectedBlocks: vi.fn().mockReturnValue([{ type: 'section', text: { type: 'mrkdwn', text: 'rejected' } }]),
  buildCancelledBlocks: vi.fn().mockReturnValue([{ type: 'section', text: { type: 'mrkdwn', text: 'cancelled' } }]),
}))

import {
  notifyNewRequest,
  notifyApproved,
  notifyRejected,
  notifyCancelled,
  notifyDelegate,
} from '@/lib/slack/notify'

describe('notifyNewRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends DMs to all admins with slack_user_id and posts to channel', async () => {
    const request = mockLeaveRequest()
    const employee = mockEmployee({ name: 'Alice' })
    const admins = [
      mockEmployee({ id: 'admin-1', slack_user_id: 'U-admin-1' }),
      mockEmployee({ id: 'admin-2', slack_user_id: 'U-admin-2' }),
      mockEmployee({ id: 'admin-3', slack_user_id: null }),
    ]

    await notifyNewRequest(request, employee, admins)

    // 2 DMs (admin-3 filtered out) + 1 channel post = 3 calls
    expect(mockPostMessage).toHaveBeenCalledTimes(3)

    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'U-admin-1' }),
    )
    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'U-admin-2' }),
    )
    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'C-leave-channel' }),
    )
  })

  it('skips admins without slack_user_id', async () => {
    const request = mockLeaveRequest()
    const employee = mockEmployee()
    const admins = [
      mockEmployee({ id: 'admin-no-slack', slack_user_id: null }),
    ]

    await notifyNewRequest(request, employee, admins)

    // Only the channel post
    expect(mockPostMessage).toHaveBeenCalledTimes(1)
    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'C-leave-channel' }),
    )
  })

  it('does not throw when a DM fails', async () => {
    mockPostMessage.mockRejectedValueOnce(new Error('Slack API error'))

    const request = mockLeaveRequest()
    const employee = mockEmployee()
    const admins = [
      mockEmployee({ id: 'admin-1', slack_user_id: 'U-admin-1' }),
    ]

    await expect(notifyNewRequest(request, employee, admins)).resolves.toBeUndefined()
  })

  it('does not throw when channel post fails', async () => {
    mockPostMessage
      .mockResolvedValueOnce({ ok: true })
      .mockRejectedValueOnce(new Error('Channel post error'))

    const request = mockLeaveRequest()
    const employee = mockEmployee()
    const admins = [
      mockEmployee({ id: 'admin-1', slack_user_id: 'U-admin-1' }),
    ]

    await expect(notifyNewRequest(request, employee, admins)).resolves.toBeUndefined()
  })

  it('includes blocks and fallback text in messages', async () => {
    const request = mockLeaveRequest()
    const employee = mockEmployee({ name: 'Alice' })
    const admins = [mockEmployee({ id: 'admin-1', slack_user_id: 'U-admin-1' })]

    await notifyNewRequest(request, employee, admins)

    const dmCall = mockPostMessage.mock.calls.find(
      (c: unknown[]) => (c[0] as { channel: string }).channel === 'U-admin-1',
    )!
    expect(dmCall[0].blocks).toBeDefined()
    expect(dmCall[0].text).toContain('Alice')
  })
})

describe('notifyApproved', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends DM to employee and posts to channel', async () => {
    const request = mockLeaveRequest()
    const employee = mockEmployee({ slack_user_id: 'U-employee' })

    await notifyApproved(request, employee, ['Delegate A'])

    expect(mockPostMessage).toHaveBeenCalledTimes(2)
    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'U-employee' }),
    )
    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'C-leave-channel' }),
    )
  })

  it('skips employee DM if no slack_user_id', async () => {
    const request = mockLeaveRequest()
    const employee = mockEmployee({ slack_user_id: null })

    await notifyApproved(request, employee)

    expect(mockPostMessage).toHaveBeenCalledTimes(1)
    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'C-leave-channel' }),
    )
  })

  it('does not throw when DM or channel fails', async () => {
    mockPostMessage.mockRejectedValue(new Error('boom'))

    const request = mockLeaveRequest()
    const employee = mockEmployee({ slack_user_id: 'U-employee' })

    await expect(notifyApproved(request, employee)).resolves.toBeUndefined()
  })
})

describe('notifyDelegate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends DM to delegate with leave info', async () => {
    const request = mockLeaveRequest({
      start_date: '2026-04-01',
      end_date: '2026-04-03',
      days: 3,
      handover_url: 'https://docs.google.com/handover',
    })
    const employee = mockEmployee({ name: 'Alice' })
    const delegate = mockEmployee({ id: 'del-1', slack_user_id: 'U-delegate' })

    await notifyDelegate(request, employee, delegate)

    expect(mockPostMessage).toHaveBeenCalledTimes(1)
    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'U-delegate',
        text: expect.stringContaining('Alice'),
      }),
    )

    const callArgs = mockPostMessage.mock.calls[0][0]
    const blockText = callArgs.blocks[0].text.text
    expect(blockText).toContain('Alice')
    expect(blockText).toContain('2026-04-01 ~ 2026-04-03')
    expect(blockText).toContain('交接事項')
  })

  it('skips if delegate has no slack_user_id', async () => {
    const request = mockLeaveRequest()
    const employee = mockEmployee()
    const delegate = mockEmployee({ id: 'del-1', slack_user_id: null })

    await notifyDelegate(request, employee, delegate)

    expect(mockPostMessage).not.toHaveBeenCalled()
  })

  it('does not include handover text when handover_url is null', async () => {
    const request = mockLeaveRequest({ handover_url: null })
    const employee = mockEmployee({ name: 'Bob' })
    const delegate = mockEmployee({ id: 'del-1', slack_user_id: 'U-delegate' })

    await notifyDelegate(request, employee, delegate)

    expect(mockPostMessage).toHaveBeenCalledTimes(1)
    const callArgs = mockPostMessage.mock.calls[0][0]
    const blockText = callArgs.blocks[0].text.text
    expect(blockText).not.toContain('交接事項')
  })

  it('does not throw when DM fails', async () => {
    mockPostMessage.mockRejectedValueOnce(new Error('DM failed'))

    const request = mockLeaveRequest()
    const employee = mockEmployee()
    const delegate = mockEmployee({ id: 'del-1', slack_user_id: 'U-delegate' })

    await expect(notifyDelegate(request, employee, delegate)).resolves.toBeUndefined()
  })
})

describe('notifyRejected', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends DM to employee', async () => {
    const request = mockLeaveRequest()
    const employee = mockEmployee({ slack_user_id: 'U-employee' })

    await notifyRejected(request, employee)

    expect(mockPostMessage).toHaveBeenCalledTimes(1)
    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'U-employee' }),
    )
  })

  it('skips if employee has no slack_user_id', async () => {
    const request = mockLeaveRequest()
    const employee = mockEmployee({ slack_user_id: null })

    await notifyRejected(request, employee)

    expect(mockPostMessage).not.toHaveBeenCalled()
  })

  it('does not throw on failure', async () => {
    mockPostMessage.mockRejectedValueOnce(new Error('Slack error'))

    const request = mockLeaveRequest()
    const employee = mockEmployee({ slack_user_id: 'U-employee' })

    await expect(notifyRejected(request, employee)).resolves.toBeUndefined()
  })
})

describe('notifyCancelled', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('posts to the leave channel', async () => {
    const request = mockLeaveRequest()
    const employee = mockEmployee({ name: 'Alice' })

    await notifyCancelled(request, employee)

    expect(mockPostMessage).toHaveBeenCalledTimes(1)
    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'C-leave-channel' }),
    )
  })

  it('does not throw on failure', async () => {
    mockPostMessage.mockRejectedValueOnce(new Error('Channel error'))

    const request = mockLeaveRequest()
    const employee = mockEmployee()

    await expect(notifyCancelled(request, employee)).resolves.toBeUndefined()
  })
})
