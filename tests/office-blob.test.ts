import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { OFFICE_BLOB } from '../payload/office-blob'

const config = readFileSync(path.resolve(__dirname, '../payload.config.ts'), 'utf8')

describe('office-files blob storage', () => {
  it('uses random-suffixed names and no client uploads (the store is public, so the address must not be guessable)', () => {
    expect(OFFICE_BLOB.addRandomSuffix).toBe(true)
    expect(OFFICE_BLOB.clientUploads).toBe(false)
  })

  it('the office-files plugin instance is wired to those options and keeps the access-controlled download route', () => {
    const start = config.indexOf("collections: { 'office-files'")
    expect(start).toBeGreaterThan(0)
    const block = config.slice(config.lastIndexOf('vercelBlobStorage({', start), start + 120).replace(/\/\/.*$/gm, '')
    expect(block).toContain('addRandomSuffix: OFFICE_BLOB.addRandomSuffix')
    expect(block).toContain('clientUploads: OFFICE_BLOB.clientUploads')
    expect(block).not.toContain('disablePayloadAccessControl')
    expect(block).not.toMatch(/addRandomSuffix:\s*false/)
  })

  it('no other plugin instance manages office-files', () => {
    expect(config.match(/'office-files'/g)?.length).toBe(1)
  })
})
