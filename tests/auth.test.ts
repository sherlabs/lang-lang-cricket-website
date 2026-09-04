import { describe, it, expect, beforeAll } from 'vitest'
import bcrypt from 'bcryptjs'

beforeAll(() => {
  process.env.AUTH_SECRET = 'test-secret-at-least-32-chars-long-xx'
  process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync('correct-horse', 10)
})

describe('lib/auth', () => {
  it('checkPassword accepts the right password and rejects a wrong one', async () => {
    const { checkPassword } = await import('@/lib/auth')
    expect(await checkPassword('correct-horse')).toBe(true)
    expect(await checkPassword('wrong')).toBe(false)
  })

  it('createSessionCookie produces a token verifySessionCookie accepts', async () => {
    const { createSessionCookie, verifySessionCookie } = await import('@/lib/auth')
    const token = await createSessionCookie()
    expect(await verifySessionCookie(token)).toBe(true)
    expect(await verifySessionCookie('garbage.token.value')).toBe(false)
  })
})
