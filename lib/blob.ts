import { put } from '@vercel/blob'

export async function uploadFile(file: File, pathPrefix: string): Promise<string> {
  const blob = await put(`${pathPrefix}/${Date.now()}-${file.name}`, file, {
    access: 'public',
  })
  return blob.url
}
