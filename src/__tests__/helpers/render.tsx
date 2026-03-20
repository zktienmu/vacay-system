import { render, type RenderOptions } from '@testing-library/react'
import { I18nProvider } from '@/lib/i18n/context'
import type { ReactElement, ReactNode } from 'react'

function AllProviders({ children }: { children: ReactNode }) {
  return <I18nProvider>{children}</I18nProvider>
}

export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) {
  return render(ui, { wrapper: AllProviders, ...options })
}
