import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sessionOptions, defaultSession } from '@/lib/auth/session'

describe('sessionOptions', () => {
  const originalEnv = process.env.NODE_ENV

  afterEach(() => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: originalEnv, writable: true })
  })

  it('has the correct cookie name', () => {
    expect(sessionOptions.cookieName).toBe('vaca_session')
  })

  it('has httpOnly set to true', () => {
    expect(sessionOptions.cookieOptions?.httpOnly).toBe(true)
  })

  it('has sameSite set to lax', () => {
    expect(sessionOptions.cookieOptions?.sameSite).toBe('lax')
  })

  it('has maxAge set to 8 hours (28800 seconds)', () => {
    expect(sessionOptions.cookieOptions?.maxAge).toBe(8 * 60 * 60)
  })

  it('has path set to /', () => {
    expect(sessionOptions.cookieOptions?.path).toBe('/')
  })

  it('uses SESSION_SECRET from environment for password', () => {
    // The password references process.env.SESSION_SECRET
    // We just verify the key is wired up (the value is process.env.SESSION_SECRET!)
    expect(sessionOptions.password).toBeDefined()
  })
})

describe('defaultSession', () => {
  it('has empty employee_id', () => {
    expect(defaultSession.employee_id).toBe('')
  })

  it('has empty wallet_address', () => {
    expect(defaultSession.wallet_address).toBe('')
  })

  it('has empty name', () => {
    expect(defaultSession.name).toBe('')
  })

  it('has role set to employee', () => {
    expect(defaultSession.role).toBe('employee')
  })

  it('has nonce set to undefined', () => {
    expect(defaultSession.nonce).toBeUndefined()
  })

  it('has nonce_issued_at set to undefined', () => {
    expect(defaultSession.nonce_issued_at).toBeUndefined()
  })
})
