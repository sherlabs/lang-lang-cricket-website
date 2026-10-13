import { describe, expect, it } from 'vitest'
import { googleVerificationBody } from '../config/site'

const FILE = 'google0123456789abcdef.html'

describe('Search Console verification file', () => {
  it('serves exactly the one-line body when the env names the file', () => {
    expect(googleVerificationBody(FILE, { GOOGLE_SITE_VERIFICATION_FILE: FILE })).toBe(`google-site-verification: ${FILE}`)
    expect(googleVerificationBody(FILE, { GOOGLE_SITE_VERIFICATION_FILE: `  ${FILE} ` })).toBe(`google-site-verification: ${FILE}`)
  })

  it('is a 404 (null) when the env is unset, empty or names a different file', () => {
    expect(googleVerificationBody(FILE, {})).toBeNull()
    expect(googleVerificationBody(FILE, { GOOGLE_SITE_VERIFICATION_FILE: '' })).toBeNull()
    expect(googleVerificationBody(FILE, { GOOGLE_SITE_VERIFICATION_FILE: 'google1111111111111111.html' })).toBeNull()
  })

  it('refuses a name that is not the Google pattern, even if the env matches', () => {
    for (const bad of ['googleXYZ.html', 'google0123456789abcdef.htm', '../google0123456789abcdef.html', 'google0123456789abcdef.html.txt']) {
      expect(googleVerificationBody(bad, { GOOGLE_SITE_VERIFICATION_FILE: bad })).toBeNull()
    }
  })
})
