import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock localStorage for jsdom
if (typeof globalThis.localStorage === 'undefined' || typeof globalThis.localStorage.getItem !== 'function') {
  const store: Record<string, string> = {}
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: vi.fn((key: string) => store[key] ?? null),
      setItem: vi.fn((key: string, value: string) => { store[key] = value }),
      removeItem: vi.fn((key: string) => { delete store[key] }),
      clear: vi.fn(() => { Object.keys(store).forEach(key => delete store[key]) }),
      get length() { return Object.keys(store).length },
      key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
    },
    writable: true,
  })
}
