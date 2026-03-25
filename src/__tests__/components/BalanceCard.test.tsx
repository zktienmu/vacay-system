import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import BalanceCard from '@/components/BalanceCard'
import type { LeaveBalance } from '@/types'
import { renderWithProviders } from '@/__tests__/helpers/render'

describe('BalanceCard', () => {
  const defaultBalance: LeaveBalance = {
    leave_type: 'annual',
    total_days: 20,
    used_days: 5,
    remaining_days: 15,
  }

  it('renders the remaining days prominently', () => {
    renderWithProviders(<BalanceCard balance={defaultBalance} />)
    expect(screen.getByText('15')).toBeInTheDocument()
  })

  it('renders the leave type emoji', () => {
    renderWithProviders(<BalanceCard balance={defaultBalance} />)
    // Annual leave emoji is palm tree
    expect(screen.getByText('\uD83C\uDF34')).toBeInTheDocument()
  })

  it('renders the leave type label', () => {
    const { container } = renderWithProviders(<BalanceCard balance={defaultBalance} />)
    // The label is rendered inside an h3 element
    const label = container.querySelector('h3')
    expect(label).toBeInTheDocument()
    expect(label?.textContent).toBeTruthy()
  })

  it('renders used/total text', () => {
    const { container } = renderWithProviders(<BalanceCard balance={defaultBalance} />)
    // The text is in a p.text-xs element, checking for the numbers
    const usedTotalP = container.querySelector('p.mb-2')
    expect(usedTotalP?.textContent).toContain('5')
    expect(usedTotalP?.textContent).toContain('20')
  })

  it('renders remaining days text', () => {
    const { container } = renderWithProviders(<BalanceCard balance={defaultBalance} />)
    const remainingP = container.querySelector('p.mt-2')
    expect(remainingP?.textContent).toContain('15')
  })

  it('shows 0 remaining when all days used', () => {
    const balance: LeaveBalance = {
      leave_type: 'personal',
      total_days: 5,
      used_days: 5,
      remaining_days: 0,
    }
    renderWithProviders(<BalanceCard balance={balance} />)
    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('renders different emojis for different leave types', () => {
    const sickBalance: LeaveBalance = {
      leave_type: 'sick',
      total_days: 10,
      used_days: 2,
      remaining_days: 8,
    }
    renderWithProviders(<BalanceCard balance={sickBalance} />)
    // Sick leave emoji is hospital
    expect(screen.getByText('\uD83C\uDFE5')).toBeInTheDocument()
  })

  it('renders a progress bar with correct width', () => {
    const { container } = renderWithProviders(<BalanceCard balance={defaultBalance} />)
    // The progress bar has a specific style width
    const progressBar = container.querySelector('[style*="width"]')
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
    const { container } = renderWithProviders(<BalanceCard balance={overusedBalance} />)
    const progressBar = container.querySelector('[style*="width"]')
    expect(progressBar?.getAttribute('style')).toContain('100%')
  })

  it('shows 0% progress when total_days is 0', () => {
    const emptyBalance: LeaveBalance = {
      leave_type: 'personal',
      total_days: 0,
      used_days: 0,
      remaining_days: 0,
    }
    const { container } = renderWithProviders(<BalanceCard balance={emptyBalance} />)
    const progressBar = container.querySelector('[style*="width"]')
    expect(progressBar?.getAttribute('style')).toContain('0%')
  })

  it('applies green color to progress bar when usage is low (< 50%)', () => {
    const { container } = renderWithProviders(<BalanceCard balance={defaultBalance} />)
    // 5/20 = 25%, which is < 50%, so green
    const progressBar = container.querySelector('[style*="width"]')
    expect(progressBar?.className).toContain('bg-green-500')
  })

  it('applies yellow color to progress bar when usage is medium (50-80%)', () => {
    const mediumBalance: LeaveBalance = {
      leave_type: 'annual',
      total_days: 20,
      used_days: 12,
      remaining_days: 8,
    }
    const { container } = renderWithProviders(<BalanceCard balance={mediumBalance} />)
    const progressBar = container.querySelector('[style*="width"]')
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
    const { container } = renderWithProviders(<BalanceCard balance={highBalance} />)
    const progressBar = container.querySelector('[style*="width"]')
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
    const { container } = renderWithProviders(<BalanceCard balance={zeroBalance} />)
    const progressBar = container.querySelector('[style*="width"]')
    expect(progressBar?.className).toContain('bg-gray-300')
  })
})
