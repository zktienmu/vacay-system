import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import LeaveTypeIcon, {
  getLeaveTypeEmoji,
  getLeaveTypeLabel,
  getLeaveTypeColor,
} from '@/components/LeaveTypeIcon'
import type { LeaveType } from '@/types'
import { renderWithProviders } from '@/__tests__/helpers/render'

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



  it('returns "Remote" for remote', () => {
    expect(getLeaveTypeLabel('remote')).toBe('Remote')
  })
})

describe('getLeaveTypeColor', () => {
  it('returns color class containing text-blue-600 for annual', () => {
    expect(getLeaveTypeColor('annual')).toContain('text-blue-600')
  })

  it('returns color class containing text-purple-600 for personal', () => {
    expect(getLeaveTypeColor('personal')).toContain('text-purple-600')
  })

  it('returns color class containing text-red-600 for sick', () => {
    expect(getLeaveTypeColor('sick')).toContain('text-red-600')
  })



  it('returns color class containing text-green-600 for remote', () => {
    expect(getLeaveTypeColor('remote')).toContain('text-green-600')
  })

  it('includes dark mode classes', () => {
    expect(getLeaveTypeColor('annual')).toContain('dark:')
  })
})

describe('LeaveTypeIcon component', () => {
  it('renders emoji for each leave type', () => {
    const types: LeaveType[] = ['annual', 'personal', 'sick', 'remote', 'family_care', 'menstrual']

    for (const type of types) {
      const { unmount } = renderWithProviders(<LeaveTypeIcon type={type} />)
      const emoji = getLeaveTypeEmoji(type)
      expect(screen.getByText(emoji)).toBeInTheDocument()
      unmount()
    }
  })

  it('does not show label by default', () => {
    const { container } = renderWithProviders(<LeaveTypeIcon type="annual" />)
    // Should have only one child span (the emoji), not a label span
    const spans = container.querySelectorAll('span > span')
    expect(spans).toHaveLength(1) // Only the emoji span
  })

  it('shows label when showLabel is true', () => {
    const { container } = renderWithProviders(<LeaveTypeIcon type="annual" showLabel />)
    // Should have two child spans (emoji + label)
    const spans = container.querySelectorAll('span > span')
    expect(spans.length).toBeGreaterThanOrEqual(2)
  })

  it('renders label text when showLabel is true', () => {
    const { container } = renderWithProviders(<LeaveTypeIcon type="annual" showLabel />)
    // The label should have the text-sm class and contain translated text
    const labelSpan = container.querySelector('span.text-sm')
    expect(labelSpan).toBeInTheDocument()
    expect(labelSpan?.textContent).toBeTruthy()
  })

  it('applies correct color class to wrapper', () => {
    const { container } = renderWithProviders(<LeaveTypeIcon type="annual" />)
    const wrapper = container.firstElementChild
    expect(wrapper?.className).toContain('text-blue-600')
  })

  it('renders as inline-flex span', () => {
    const { container } = renderWithProviders(<LeaveTypeIcon type="sick" />)
    const wrapper = container.firstElementChild
    expect(wrapper?.tagName).toBe('SPAN')
    expect(wrapper?.className).toContain('inline-flex')
  })
})
