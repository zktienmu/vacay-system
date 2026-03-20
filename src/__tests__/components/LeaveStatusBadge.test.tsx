import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import LeaveStatusBadge from '@/components/LeaveStatusBadge'
import type { LeaveStatus } from '@/types'
import { renderWithProviders } from '@/__tests__/helpers/render'

describe('LeaveStatusBadge', () => {
  // The I18nProvider defaults to zh-TW locale. The component uses t() for labels.
  // We test the rendered output and styling.

  const statuses: LeaveStatus[] = ['pending', 'approved', 'rejected', 'cancelled']

  it('renders a badge for each status without crashing', () => {
    for (const status of statuses) {
      const { unmount } = renderWithProviders(<LeaveStatusBadge status={status} />)
      // There should be a span element rendered
      const badge = document.querySelector('span.inline-flex')
      expect(badge).toBeInTheDocument()
      unmount()
    }
  })

  it('applies yellow styling for pending status', () => {
    const { container } = renderWithProviders(<LeaveStatusBadge status="pending" />)
    const badge = container.querySelector('span')
    expect(badge?.className).toContain('bg-yellow-100')
    expect(badge?.className).toContain('text-yellow-800')
  })

  it('applies green styling for approved status', () => {
    const { container } = renderWithProviders(<LeaveStatusBadge status="approved" />)
    const badge = container.querySelector('span')
    expect(badge?.className).toContain('bg-green-100')
    expect(badge?.className).toContain('text-green-800')
  })

  it('applies red styling for rejected status', () => {
    const { container } = renderWithProviders(<LeaveStatusBadge status="rejected" />)
    const badge = container.querySelector('span')
    expect(badge?.className).toContain('bg-red-100')
    expect(badge?.className).toContain('text-red-800')
  })

  it('applies gray styling for cancelled status', () => {
    const { container } = renderWithProviders(<LeaveStatusBadge status="cancelled" />)
    const badge = container.querySelector('span')
    expect(badge?.className).toContain('bg-gray-100')
    expect(badge?.className).toContain('text-gray-600')
  })

  it('renders as a span element', () => {
    const { container } = renderWithProviders(<LeaveStatusBadge status="pending" />)
    const badge = container.querySelector('span')
    expect(badge?.tagName).toBe('SPAN')
  })

  it('includes rounded-full class for pill-shaped badge', () => {
    const { container } = renderWithProviders(<LeaveStatusBadge status="pending" />)
    const badge = container.querySelector('span')
    expect(badge?.className).toContain('rounded-full')
  })

  it('includes dark mode classes', () => {
    const { container } = renderWithProviders(<LeaveStatusBadge status="pending" />)
    const badge = container.querySelector('span')
    expect(badge?.className).toContain('dark:')
  })

  it('renders non-empty text content for each status', () => {
    for (const status of statuses) {
      const { container, unmount } = renderWithProviders(<LeaveStatusBadge status={status} />)
      const badge = container.querySelector('span')
      expect(badge?.textContent).toBeTruthy()
      expect(badge?.textContent?.length).toBeGreaterThan(0)
      unmount()
    }
  })
})
