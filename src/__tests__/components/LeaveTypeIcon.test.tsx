import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import LeaveTypeIcon, {
  getLeaveTypeEmoji,
  getLeaveTypeLabel,
  getLeaveTypeColor,
} from '@/components/LeaveTypeIcon'
import type { LeaveType } from '@/types'

describe('getLeaveTypeEmoji', () => {
  it('returns palm tree emoji for annual', () => {
    expect(getLeaveTypeEmoji('annual')).toBe('\uD83C\uDF34')
  })

  it('returns person emoji for personal', () => {
    expect(getLeaveTypeEmoji('personal')).toBe('\uD83D\uDC64')
  })

  it('returns hospital emoji for sick', () => {
    expect(getLeaveTypeEmoji('sick')).toBe('\uD83C\uDFE5')
  })

  it('returns briefcase emoji for official', () => {
    expect(getLeaveTypeEmoji('official')).toBe('\uD83D\uDCBC')
  })

  it('returns clipboard emoji for unpaid', () => {
    expect(getLeaveTypeEmoji('unpaid')).toBe('\uD83D\uDCCB')
  })

  it('returns house emoji for remote', () => {
    expect(getLeaveTypeEmoji('remote')).toBe('\uD83C\uDFE0')
  })
})

describe('getLeaveTypeLabel', () => {
  it('returns "Annual" for annual', () => {
    expect(getLeaveTypeLabel('annual')).toBe('Annual')
  })

  it('returns "Personal" for personal', () => {
    expect(getLeaveTypeLabel('personal')).toBe('Personal')
  })

  it('returns "Sick" for sick', () => {
    expect(getLeaveTypeLabel('sick')).toBe('Sick')
  })

  it('returns "Official" for official', () => {
    expect(getLeaveTypeLabel('official')).toBe('Official')
  })

  it('returns "Unpaid" for unpaid', () => {
    expect(getLeaveTypeLabel('unpaid')).toBe('Unpaid')
  })

  it('returns "Remote" for remote', () => {
    expect(getLeaveTypeLabel('remote')).toBe('Remote')
  })
})

describe('getLeaveTypeColor', () => {
  const expectedColors: Record<LeaveType, string> = {
    annual: 'text-blue-600',
    personal: 'text-purple-600',
    sick: 'text-red-600',
    official: 'text-teal-600',
    unpaid: 'text-gray-600',
    remote: 'text-green-600',
  }

  for (const [type, color] of Object.entries(expectedColors)) {
    it(`returns "${color}" for ${type}`, () => {
      expect(getLeaveTypeColor(type as LeaveType)).toBe(color)
    })
  }
})

describe('LeaveTypeIcon component', () => {
  it('renders emoji for each leave type', () => {
    const types: LeaveType[] = ['annual', 'personal', 'sick', 'official', 'unpaid', 'remote']

    for (const type of types) {
      const { unmount } = render(<LeaveTypeIcon type={type} />)
      const emoji = getLeaveTypeEmoji(type)
      expect(screen.getByText(emoji)).toBeInTheDocument()
      unmount()
    }
  })

  it('does not show label by default', () => {
    render(<LeaveTypeIcon type="annual" />)
    expect(screen.queryByText('Annual')).not.toBeInTheDocument()
  })

  it('shows label when showLabel is true', () => {
    render(<LeaveTypeIcon type="annual" showLabel />)
    expect(screen.getByText('Annual')).toBeInTheDocument()
  })

  it('shows label for each type when showLabel is true', () => {
    const types: { type: LeaveType; label: string }[] = [
      { type: 'annual', label: 'Annual' },
      { type: 'personal', label: 'Personal' },
      { type: 'sick', label: 'Sick' },
      { type: 'official', label: 'Official' },
      { type: 'unpaid', label: 'Unpaid' },
      { type: 'remote', label: 'Remote' },
    ]

    for (const { type, label } of types) {
      const { unmount } = render(<LeaveTypeIcon type={type} showLabel />)
      expect(screen.getByText(label)).toBeInTheDocument()
      unmount()
    }
  })

  it('applies correct color class', () => {
    const { container } = render(<LeaveTypeIcon type="annual" />)
    const wrapper = container.firstElementChild
    expect(wrapper?.className).toContain('text-blue-600')
  })

  it('renders as inline-flex span', () => {
    const { container } = render(<LeaveTypeIcon type="sick" />)
    const wrapper = container.firstElementChild
    expect(wrapper?.tagName).toBe('SPAN')
    expect(wrapper?.className).toContain('inline-flex')
  })
})
