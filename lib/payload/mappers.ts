/**
 * Payload doc → domain type (spec §14). Pure; no Payload runtime import.
 */
import type { Announcement, DocumentItem, GalleryPhoto, Person, Sponsor } from '@/lib/domain'
import type {
  Announcement as AnnouncementDoc,
  Document as DocumentDoc,
  GalleryPhoto as GalleryPhotoDoc,
  Media,
  Person as PersonDoc,
  Sponsor as SponsorDoc,
} from '@/payload-types'

/** URL of a populated upload relation; '' for an unpopulated id, null or a file-less doc. */
export function mediaUrl(value: number | Media | null | undefined): string {
  return value && typeof value === 'object' ? (value.url ?? '') : ''
}

const date = (v: string | null | undefined) => new Date(v ?? 0)

export const toSponsor = (d: SponsorDoc): Sponsor => ({
  id: d.id,
  tier: d.tier,
  name: d.name,
  logoUrl: mediaUrl(d.logo),
  linkUrl: d.linkUrl ?? '',
  sortOrder: d.sortOrder ?? 0,
})

export const toPerson = (d: PersonDoc): Person => ({
  id: d.id,
  name: d.name,
  role: d.role,
  section: d.section ?? 'committee',
  phone: d.phone ?? '',
  email: d.email ?? '',
  photoUrl: mediaUrl(d.photo),
  sortOrder: d.sortOrder ?? 0,
})

export const toGalleryPhoto = (d: GalleryPhotoDoc): GalleryPhoto => ({
  id: d.id,
  url: d.url ?? '',
  caption: d.caption ?? '',
  sortOrder: d.sortOrder ?? 0,
  createdAt: date(d.createdAt),
})

export const toDocumentItem = (d: DocumentDoc): DocumentItem => ({
  id: d.id,
  title: d.title,
  category: d.category,
  url: d.url ?? '',
})

export const toAnnouncement = (d: AnnouncementDoc): Announcement => ({
  id: d.id,
  title: d.title,
  body: d.body ?? '',
  published: Boolean(d.published),
  createdAt: date(d.createdAt),
  updatedAt: date(d.updatedAt),
})
