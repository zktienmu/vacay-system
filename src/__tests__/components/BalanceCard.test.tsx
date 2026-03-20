import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import BalanceCard from '@/components/BalanceCard'
import type { LeaveBalance } from '@/types'

describe('BalanceCard', () => {
  const defaultBalance: LeaveBalance = {
    leave_type: 'annual',
    total_days: 20,
    used_days: 5,
    remaining_days: 15,
  }

  it('renders the leave type label', () => {
    render(<BalanceCard balance={defaultBalance} />)
    expect(screen.getByText('Annual')).toBeInTheDocument()
  })

  it('renders the remaining days prominently', () => {
    render(<BalanceCard balance={defaultBalance} />)
    expect(screen.getByText('15')).toBeInTheDocument()
  })

  it('renders used/total text', () => {
    render(<BalanceCard balance={defaultBalance} />)
    expect(screen.getByText('5 used / 20 total')).toBeInTheDocument()
  })

  it('renders remaining days text with plural', () => {
    render(<BalanceCard balance={defaultBalance} />)
    expect(screen.getByText('15 days remaining')).toBeInTheDocument()
  })

  it('renders singular "day" when remaining is 1', () => {
    const balance: LeaveBalance = {
      leave_type: 'sick',
      total_days: 10,
      used_days: 9,
      remaining_days: 1,
    }
    render(<BalanceCard balance={balance} />)
    expect(screen.getByText('1 day remaining')).toBeInTheDocument()
  })

  it('shows 0 remaining when all days used', () => {
    const balance: LeaveBalance = {
      leave_type: 'personal',
      total_days: 5,
      used_days: 5,
      remaining_days: 0,
    }
    render(<BalanceCard balance={balance} />)
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.getByText('5 used / 5 total')).toBeInTheDocument()
    expect(screen.getByText('0 days remaining')).toBeInTheDocument()
  })

  it('renders the emoji for the leave type', () => {
    render(<BalanceCard balance={defaultBalance} />)
    // Annual leave emoji is palm tree
    expect(screen.getByText('\uD83C\uDF34')).toBeInTheDocument()
  })

  it('renders different emojis for different leave types', () => {
    const sickBalance: LeaveBalance = {
      leave_type: 'sick',
      total_days: 10,
      used_days: 2,
      remaining_days: 8,
    }
    render(<BalanceCard balance={sickBalance} />)
    // Sick leave emoji is hospital
    expect(screen.getByText('\uD83C\uDFE5')).toBeInTheDocument()
    expect(screen.getByText('Sick')).toBeInTheDocument()
  })

  it('renders a progress bar', () => {
    const { container } = render(<BalanceCard balance={defaultBalance} />)
    // The progress bar has a specific style width
    const progressBar = container.querySelector('[style]')
    expect(progressBar).toBeInTheDocument()
    // 5/20 = 25%
    expect(progressBar?.getAttribute('style')).toContain('25%')
  })

  it('caps progress bar at 100%', () => {
    const overusedBalance: LeaveBalance = {
      leave_type: 'annual',
      total_days: 5,
      used_days: 10,
      remaining_days: -5,
    }
    const { container } = render(<BalanceCard balance={overusedBalance} />)
    const progressBar = container.querySelector('[style]')
    expect(progressBar?.getAttribute('style')).toContain('100%')
  })

  it('shows 0% progress when total_days is 0', () => {
    const emptyBalance: LeaveBalance = {
      leave_type: 'unpaid',
      total_days: 0,
      used_days: 0,
      remaining_days: 0,
    }
    const { container } = render(<BalanceCard balance={emptyBalance} />)
    const progressBar = container.querySelector('[style]')
    expect(progressBar?.getAttribute('style')).toContain('0%')
  })

  it('applies green color to progress bar when usage is low (< 50%)', () => {
    const { container } = render(<BalanceCard balance={defaultBalance} />)
    // 5/20 = 25%, which is < 50%, so green
    const progressBar = container.querySelector('[style]')
    expect(progressBar?.className).toContain('bg-green-500')
  })

  it('applies yellow color to progress bar when usage is medium (50-80%)', () => {
    const mediumBalance: LeaveBalance = {
      leave_type: 'annual',
      total_days: 20,
      used_days: 12,
      remaining_days: 8,
    }
    const { container } = render(<BalanceCard balance={mediumBalance} />)
    const progressBar = container.querySelector('[style]')
    // 12/20 = 60%, which is >= 50% and < 80%, so yellow
    expect(progressBar?.className).toContain('bg-yellow-500')
  })

  it('applies red color to progress bar when usage is high (>= 80%)', () => {
    const highBalance: LeaveBalance = {
      leave_type: 'annual',
      total_days: 20,
      used_days: 18,
      remaining_days: 2,
    }
    const { container } = render(<BalanceCard balance={highBalance} />)
    const progressBar = container.querySelector('[style]')
    // 18/20 = 90%, which is >= 80%, so red
    expect(progressBar?.className).toContain('bg-red-500')
  })

  it('applies gray color when total_days is 0', () => {
    const zeroBalance: LeaveBalance = {
      leave_type: 'annual',
      total_days: 0,
      used_days: 0,
      remaining_days: 0,
    }
    const { container } = render(<BalanceCard balance={zeroBalance} />)
    const progressBar = container.querySelector('[style]')
    expect(progressBar?.className).toContain('bg-gray-300')
  })
})
