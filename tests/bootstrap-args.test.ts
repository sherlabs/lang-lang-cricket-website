import { describe, expect, it } from 'vitest'
import { parseBootstrapArgs } from '../payload/bootstrap/args'
import { assetDecision } from '../payload/bootstrap/run-bootstrap'

const LOCAL = { DATABASE_URI: 'postgres://u:p@127.0.0.1:54329/langlang_dev' }
const base = ['--profile', 'clubs/example-fc/profile.json', '--target', '127.0.0.1/langlang_dev']

describe('parseBootstrapArgs', () => {
  it('is a dry run by default and needs no --confirm to read', () => {
    const a = parseBootstrapArgs(base, LOCAL)
    expect(a.confirm).toBe(false)
    expect(a.guard.confirmed).toBe(false)
    expect(a.profilePath).toBe('clubs/example-fc/profile.json')
  })

  it('writes only with --confirm, and the flags are read', () => {
    const a = parseBootstrapArgs([...base, '--confirm', '--force', '--skip-admin', '--skip-assets'], LOCAL)
    expect(a).toMatchObject({ confirm: true, force: true, skipAdmin: true, skipAssets: true })
  })

  it('refuses when --target does not equal DATABASE_URI, even for a dry run', () => {
    expect(() => parseBootstrapArgs(['--profile', 'p.json', '--target', '127.0.0.1/other_db'], LOCAL)).toThrow(/does not match/)
    expect(() => parseBootstrapArgs(['--profile', 'p.json'], LOCAL)).toThrow(/--target/)
  })

  it('refuses a remote host without ALLOW_REMOTE_DB=yes, and accepts it with', () => {
    const remote = { DATABASE_URI: 'postgres://u:p@db.example.net:5432/club' }
    const args = ['--profile', 'p.json', '--target', 'db.example.net/club']
    expect(() => parseBootstrapArgs(args, remote)).toThrow(/ALLOW_REMOTE_DB/)
    expect(parseBootstrapArgs(args, { ...remote, ALLOW_REMOTE_DB: 'yes' }).guard.local).toBe(false)
  })

  it('needs a profile', () => {
    expect(() => parseBootstrapArgs(['--target', '127.0.0.1/langlang_dev'], LOCAL)).toThrow(/--profile/)
  })
})

describe('assetDecision', () => {
  const o = { skipAssets: false, blobToken: false, allowRemoteBlob: false, already: false }
  it('uploads by default and keeps an asset that is already set', () => {
    expect(assetDecision(o).action).toBe('upload')
    expect(assetDecision({ ...o, already: true }).action).toBe('kept')
  })
  it('skips on purpose with --skip-assets', () => {
    expect(assetDecision({ ...o, skipAssets: true })).toEqual({ action: 'skipped', reason: '--skip-assets' })
  })
  it('skips when a Blob token is set without ALLOW_REMOTE_BLOB=yes, and plans the upload with it', () => {
    expect(assetDecision({ ...o, blobToken: true }).action).toBe('skipped')
    expect(assetDecision({ ...o, blobToken: true, allowRemoteBlob: true }).action).toBe('upload')
  })
})
