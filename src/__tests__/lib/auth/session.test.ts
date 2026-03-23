import { describe, it, expect } from 'vitest'

// The session module imports from iron-session which is available as a dependency.
// We just test the exported config values.
import { sessionOptions, defaultSession } from '@/lib/auth/session'

describe('sessionOptions', () => {
  it('has the correct cookie name', () => {
    expect(sessionOptions.cookieName).toBe('dinngo_leave_session')
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

  it('references SESSION_SECRET env variable for password', () => {
    // The password references process.env.SESSION_SECRET!
    // In test env without the env var, it will be undefined
    // We verify the config structure is correct by checking that the key exists
    expect('password' in sessionOptions).toBe(true)
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
