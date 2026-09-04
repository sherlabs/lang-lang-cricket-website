import { SignJWT, jwtVerify } from 'jose'
import bcrypt from 'bcryptjs'

const COOKIE_NAME = 'llcc_admin_session'

function secretKey() {
  return new TextEncoder().encode(process.env.AUTH_SECRET!)
}

export async function checkPassword(password: string): Promise<boolean> {
  return bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH!)
}

export async function createSessionCookie(): Promise<string> {
  return new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secretKey())
}

export async function verifySessionCookie(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, secretKey())
    return true
  } catch {
    return false
  }
}

export { COOKIE_NAME }
