import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import LeaveStatusBadge from '@/components/LeaveStatusBadge'
import type { LeaveStatus } from '@/types'

describe('LeaveStatusBadge', () => {
  it('renders "Pending" text for pending status', () => {
    render(<LeaveStatusBadge status="pending" />)
    expect(screen.getByText('Pending')).toBeInTheDocument()
  })

  it('renders "Approved" text for approved status', () => {
    render(<LeaveStatusBadge status="approved" />)
    expect(screen.getByText('Approved')).toBeInTheDocument()
  })

  it('renders "Rejected" text for rejected status', () => {
    render(<LeaveStatusBadge status="rejected" />)
    expect(screen.getByText('Rejected')).toBeInTheDocument()
  })

  it('renders "Cancelled" text for cancelled status', () => {
    render(<LeaveStatusBadge status="cancelled" />)
    expect(screen.getByText('Cancelled')).toBeInTheDocument()
  })

  it('applies yellow styling for pending status', () => {
    render(<LeaveStatusBadge status="pending" />)
    const badge = screen.getByText('Pending')
    expect(badge.className).toContain('bg-yellow-100')
    expect(badge.className).toContain('text-yellow-800')
  })

  it('applies green styling for approved status', () => {
    render(<LeaveStatusBadge status="approved" />)
    const badge = screen.getByText('Approved')
    expect(badge.className).toContain('bg-green-100')
    expect(badge.className).toContain('text-green-800')
  })

  it('applies red styling for rejected status', () => {
    render(<LeaveStatusBadge status="rejected" />)
    const badge = screen.getByText('Rejected')
    expect(badge.className).toContain('bg-red-100')
    expect(badge.className).toContain('text-red-800')
  })

  it('applies gray styling for cancelled status', () => {
    render(<LeaveStatusBadge status="cancelled" />)
    const badge = screen.getByText('Cancelled')
    expect(badge.className).toContain('bg-gray-100')
    expect(badge.className).toContain('text-gray-600')
  })

  it('renders as a span element', () => {
    render(<LeaveStatusBadge status="pending" />)
    const badge = screen.getByText('Pending')
    expect(badge.tagName).toBe('SPAN')
  })

  it('includes rounded-full class for pill-shaped badge', () => {
    render(<LeaveStatusBadge status="pending" />)
    const badge = screen.getByText('Pending')
    expect(badge.className).toContain('rounded-full')
  })

  it('renders correctly for each status type', () => {
    const statuses: { status: LeaveStatus; label: string }[] = [
      { status: 'pending', label: 'Pending' },
      { status: 'approved', label: 'Approved' },
      { status: 'rejected', label: 'Rejected' },
      { status: 'cancelled', label: 'Cancelled' },
    ]

    for (const { status, label } of statuses) {
      const { unmount } = render(<LeaveStatusBadge status={status} />)
      expect(screen.getByText(label)).toBeInTheDocument()
      unmount()
    }
  })
})
