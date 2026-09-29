import { describe, it, expect, vi } from 'vitest'

// No session cookie → every admin action must refuse before touching the DB or Blob.
vi.mock('next/headers', () => ({ cookies: () => ({ get: () => undefined }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@vercel/blob', () => ({ del: vi.fn() }))
vi.mock('@/lib/blob', () => ({ uploadFile: vi.fn() }))
vi.mock('@/db', () => ({
  db: new Proxy({}, { get: () => { throw new Error('db touched') } }),
}))

const fd = () => new FormData()

describe('documents admin actions require a session', () => {
  it('rejects every action', async () => {
    const a = await import('@/app/admin/(shell)/documents/actions')
    await expect(a.listDocuments()).rejects.toThrow('Unauthorized')
    await expect(a.removeDocument(1)).rejects.toThrow('Unauthorized')
    await expect(a.updateDocument(1, {})).rejects.toThrow('Unauthorized')
    await expect(a.createDocument(fd())).rejects.toThrow('Unauthorized')
    await expect(a.editDocument(fd())).rejects.toThrow('Unauthorized')
  })
})

describe('gallery admin actions require a session', () => {
  it('rejects every action', async () => {
    const a = await import('@/app/admin/(shell)/gallery/actions')
    await expect(a.listGalleryPhotos()).rejects.toThrow('Unauthorized')
    await expect(a.addGalleryPhotos(['https://x.blob.vercel-storage.com/a.jpg'])).rejects.toThrow('Unauthorized')
    await expect(a.editGalleryPhoto(fd())).rejects.toThrow('Unauthorized')
    await expect(a.removeGalleryPhoto(1)).rejects.toThrow('Unauthorized')
  })
})
