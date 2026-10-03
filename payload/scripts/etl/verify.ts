/**
 * Cutover verification (spec §12.2 step 18). Runs after every non-dry ETL run and standalone as
 * `payload/scripts/verify-cutover.ts`. Every skip and drop is re-derived from the legacy source
 * with the rules the steps apply (etl/rules: orphans, unknown statuses/types/sources;
 * `normaliseStoryHtml` image drops; missing `/assets/` files).
 *
 * Checks:
 * - ids: per id-preserving table, the target holds exactly the legacy ids minus the skipped
 *   ones (counts printed as legacy − skipped vs target; rows above the legacy max are
 *   Payload-native and only reported);
 * - preserved fields, field for field: slugs, tokens, `submittedByAdmin`, `publishedAt`/
 *   `reviewedAt`, `source`, `displayName`, `sortOrder`, `excerpt`, `createdAt` (and the
 *   per-table `updatedAt` rule), RSVP `occurrenceDate.toISOString()`, relations' `legacyUrl`;
 * - stories: whitespace-normalised plain text of the legacy HTML equals the Lexical content's,
 *   and the inline image count equals the legacy count minus the drops;
 * - documents / gallery-photos / event-photos: each row's file is its legacy row's (`legacyUrl`
 *   equals the legacy url when importable), and a legacy row with a file never became a
 *   file-less row (a foreign URL, or a duplicate of another row's URL) unnoticed;
 * - every own-store upload row: the plugin's `generateURL` with the collection prefix and the
 *   stored `prefix` equals `legacyUrl`. Only fallbacks (§12.4) are exempt and listed: in-run,
 *   those the ETL report says took a fallback; standalone, rows stored under exactly the
 *   collection prefix (where a re-upload puts them) whose URL differs. Anything else fails;
 * - sequences: the next id is above both MAX(id) and the legacy `last_value`;
 * - with a Blob token: HEAD on the plugin URL of a sample of 20 rows across the four upload
 *   collections (the URL the app serves once the `legacyUrl` read rule is dropped).
 */
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { JSDOM } from 'jsdom'
import type { CollectionSlug, Payload } from 'payload'
import { sql } from '@payloadcms/db-postgres/drizzle'
import { sectionOf } from '../../../lib/people'
import { lexicalToTiptapHtml, normaliseStoryHtml, type StoryContent } from '../../../lib/stories-convert'
import { fullName } from '../../hooks/displayName'
import { classify, COLLECTION_PREFIX, importableUrl, storeIdFromToken, type UploadCollection } from './media'
import { expectedRows, importedEventIds, importedPlayerIds } from './rules'
import { ID_PRESERVING, nextSequenceValue } from './sequences'
import type { LegacyRow, LegacySource } from './source'
import { legacyHtml } from './steps/stories'
import { sponsorRanks } from './steps/sponsors'

export type VerifyCheck = { name: string; ok: boolean; checked: number; failures: string[]; notes: string[] }
export type VerifyResult = { ok: boolean; checks: VerifyCheck[] }

export type VerifyOptions = {
  payload: Payload
  source: LegacySource
  storeId: string | null
  token?: string
  publicDir: string
  /** Step names (`--only`); tables of other steps are not verified. */
  only?: readonly string[]
  /** HEAD sample size when a token is present (spec: 20). */
  headSample?: number
  /** In-run only: the ETL report's media action per `<collection> <legacyUrl>` (EtlReport.files). */
  fileActions?: ReadonlyMap<string, string>
}

type Doc = Record<string, unknown>

const iso = (v: unknown): string | null => {
  if (v === null || v === undefined || v === '') return null
  const d = v instanceof Date ? v : new Date(String(v))
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString()
}
const relId = (v: unknown): number | null => (v && typeof v === 'object' ? ((v as { id?: number }).id ?? null) : typeof v === 'number' ? v : null)
const show = (v: unknown) => JSON.stringify(v)

class Check implements VerifyCheck {
  ok = true
  checked = 0
  failures: string[] = []
  notes: string[] = []
  constructor(readonly name: string) {}
  fail(msg: string) {
    this.ok = false
    if (this.failures.length < 200) this.failures.push(msg)
  }
  note(msg: string) {
    this.notes.push(msg)
  }
  eq(where: string, field: string, legacy: unknown, target: unknown) {
    this.checked++
    if (show(legacy) !== show(target)) this.fail(`${where}.${field}: legacy ${show(legacy)} ≠ target ${show(target)}`)
  }
}

/** Whitespace-normalised text of an HTML fragment; block boundaries count as spaces. */
let textDom: JSDOM | null = null
export function htmlPlainText(html: string): string {
  textDom ??= new JSDOM('<!DOCTYPE html><body></body>')
  const div = textDom.window.document.createElement('div')
  div.innerHTML = html.replace(/<\/?(p|h[1-6]|li|ul|ol|blockquote|pre|hr|br|img)\b[^>]*>/gi, ' ')
  return (div.textContent ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim()
}

function countUploadNodes(node: unknown): number {
  if (!node || typeof node !== 'object') return 0
  const n = node as { type?: string; children?: unknown[]; root?: unknown }
  let c = n.type === 'upload' ? 1 : 0
  if (n.root) c += countUploadNodes(n.root)
  for (const child of n.children ?? []) c += countUploadNodes(child)
  return c
}

const STEP_OF_COLLECTION = (c: string) => c

type GenerateURL = (a: { baseUrl: string; collectionPrefix?: string; filename: string; prefix?: string }) => string

/** The plugin's own `generateURL` (not exported from the package entry, so loaded by file). */
export async function loadGenerateURL(): Promise<GenerateURL> {
  const entry = createRequire(import.meta.url).resolve('@payloadcms/storage-vercel-blob')
  const mod = (await import(pathToFileURL(path.join(path.dirname(entry), 'generateURL.js')).href)) as { generateURL: GenerateURL }
  return mod.generateURL
}

export async function verifyCutover(opts: VerifyOptions): Promise<VerifyResult> {
  const { payload, source, storeId, token, publicDir, only } = opts
  const want = (step: string) => !only || only.includes(step)
  const checks: Check[] = []
  const check = (name: string) => {
    const c = new Check(name)
    checks.push(c)
    return c
  }

  const all = async (collection: CollectionSlug, extra: Record<string, unknown> = {}): Promise<Doc[]> =>
    (await payload.find({ collection, pagination: false, depth: 0, overrideAccess: true, ...extra } as Parameters<Payload['find']>[0])).docs as unknown as Doc[]
  const byId = (docs: Doc[]) => new Map(docs.map((d) => [d.id as number, d]))

  // Media docs by id (for relation legacyUrl checks).
  const media = byId(await all('media'))
  const assetExists = (url: string) => {
    const c = classify(url, storeId)
    if (c.kind !== 'local-asset') return true
    const file = path.join(publicDir, c.file)
    return file.startsWith(publicDir + path.sep) && existsSync(file)
  }
  /** The legacyUrl a relation or upload row should carry: the URL itself when importable, else null. */
  const expectedRelationUrl = (url: unknown): string | null => importableUrl(url, storeId, publicDir)
  const relationUrl = (v: unknown) => {
    const id = relId(v)
    return id === null ? null : ((media.get(id)?.legacyUrl as string | null | undefined) ?? `(media#${id} without legacyUrl)`)
  }

  // ---- legacy rows and the expected (non-skipped) id sets --------------------------------
  const L = async <T extends LegacyRow>(table: string, orderBy?: string) => (await source.rows<T>(table, orderBy)) as T[]
  const legacy = {
    documents: await L('documents'),
    gallery_photos: await L('gallery_photos'),
    sponsors: await L('sponsors'),
    committee_contacts: await L('committee_contacts'),
    announcements: await L('announcements'),
    events: await L('events'),
    event_rsvps: await L('event_rsvps'),
    event_photos: await L('event_photos'),
    stories: await L('stories'),
    players: await L('players'),
    player_honours: await L('player_honours', 'player_id, sort_order, id'),
    player_aliases: await L('player_aliases', 'name_key'),
    player_seasons: await L('player_seasons'),
    player_sync_runs: await L('player_sync_runs'),
  }
  const playerIds = importedPlayerIds(legacy.players)
  const expected = expectedRows({ eventIds: importedEventIds(legacy.events), playerIds })
  const legacyOf: Record<string, LegacyRow[]> = {
    documents: legacy.documents,
    'gallery-photos': legacy.gallery_photos,
    sponsors: legacy.sponsors,
    people: legacy.committee_contacts,
    announcements: legacy.announcements,
    events: legacy.events,
    'event-rsvps': legacy.event_rsvps,
    'event-photos': legacy.event_photos,
    stories: legacy.stories,
    players: legacy.players,
    'player-seasons': legacy.player_seasons,
    'player-sync-runs': legacy.player_sync_runs,
  }

  // ---- 1. ids and counts ------------------------------------------------------------------
  const target: Record<string, Map<number, Doc>> = {}
  {
    const c = check('ids and counts (legacy − skipped = target)')
    for (const { collection } of ID_PRESERVING) {
      if (!want(STEP_OF_COLLECTION(collection))) continue
      let docs: Doc[]
      if (collection === 'player-seasons') {
        const r = (await payload.db.drizzle.execute(sql.raw('SELECT id, player_id, season_name FROM "payload"."player_seasons"'))) as { rows: Doc[] }
        docs = r.rows.map((x) => ({ id: Number(x.id), player: Number(x.player_id), seasonName: x.season_name }))
      } else if (collection === 'players' || collection === 'events') {
        docs = await all(collection as CollectionSlug, { joins: false })
      } else {
        docs = await all(collection as CollectionSlug)
      }
      target[collection] = byId(docs)
      const rows = legacyOf[collection]
      const keep = rows.filter(expected[collection])
      const legacyMax = Math.max(0, ...rows.map((r) => r.id as number), await source.sequenceLastValue(ID_PRESERVING.find((x) => x.collection === collection)!.legacyTable))
      const have = new Set(docs.map((d) => d.id as number))
      const wantIds = new Set(keep.map((r) => r.id as number))
      const missing = [...wantIds].filter((id) => !have.has(id))
      const unexpected = [...have].filter((id) => id <= legacyMax && !wantIds.has(id))
      const native = [...have].filter((id) => id > legacyMax)
      c.checked += wantIds.size
      c.note(`${collection.padEnd(17)} legacy ${rows.length} − skipped ${rows.length - keep.length} = ${keep.length}; target ${docs.length - native.length}${native.length ? ` (+${native.length} Payload-native)` : ''}`)
      if (missing.length) c.fail(`${collection}: missing legacy ids ${missing.join(', ')}`)
      if (unexpected.length) c.fail(`${collection}: target ids not in legacy (or skipped there) ${unexpected.join(', ')}`)
    }
    if (want('player-aliases')) {
      const docs = await all('player-aliases')
      const have = new Map(docs.map((d) => [d.nameKey as string, relId(d.player)]))
      const keep = legacy.player_aliases.filter((a) => playerIds.has(a.player_id as number))
      for (const a of keep) {
        c.checked++
        if (!have.has(a.name_key as string)) c.fail(`player-aliases: missing nameKey ${show(a.name_key)}`)
        else if (have.get(a.name_key as string) !== a.player_id) c.fail(`player-aliases[${show(a.name_key)}].player: legacy ${a.player_id} ≠ target ${have.get(a.name_key as string)}`)
      }
      c.note(`${'player-aliases'.padEnd(17)} legacy ${legacy.player_aliases.length} − skipped ${legacy.player_aliases.length - keep.length} = ${keep.length}; target ${docs.length}`)
    }
  }

  // ---- 2. preserved fields --------------------------------------------------------------
  {
    const c = check('preserved fields (field-for-field round trip)')
    const each = (collection: string, fn: (r: LegacyRow, d: Doc, where: string) => void) => {
      if (!want(collection) || !target[collection]) return
      for (const r of legacyOf[collection].filter(expected[collection])) {
        const d = target[collection].get(r.id as number)
        if (d) fn(r, d, `${collection}#${r.id}`)
      }
    }
    each('documents', (r, d, w) => {
      c.eq(w, 'title', r.title, d.title)
      c.eq(w, 'createdAt', iso(r.created_at), iso(d.createdAt))
    })
    each('gallery-photos', (r, d, w) => {
      c.eq(w, 'sortOrder', r.sort_order ?? 0, d.sortOrder)
      c.eq(w, 'caption', r.caption ?? '', d.caption)
      c.eq(w, 'createdAt', iso(r.created_at), iso(d.createdAt))
    })
    const ranks = sponsorRanks(legacy.sponsors as { id: number; tier: string }[])
    each('sponsors', (r, d, w) => {
      c.eq(w, 'name', r.name, d.name)
      c.eq(w, 'sortOrder', ranks.get(r.id as number), d.sortOrder)
      c.eq(w, 'logo.legacyUrl', expectedRelationUrl(r.logo_url), relationUrl(d.logo))
      c.eq(w, 'createdAt', iso(r.created_at), iso(d.createdAt))
    })
    each('people', (r, d, w) => {
      c.eq(w, 'name', r.name, d.name)
      c.eq(w, 'section', sectionOf(r.section), d.section)
      c.eq(w, 'sortOrder', r.sort_order ?? 0, d.sortOrder)
      c.eq(w, 'photo.legacyUrl', expectedRelationUrl(r.photo_url), relationUrl(d.photo))
      c.eq(w, 'createdAt', iso(r.created_at), iso(d.createdAt))
    })
    each('announcements', (r, d, w) => {
      c.eq(w, 'title', r.title, d.title)
      c.eq(w, 'published', Boolean(r.published), d.published)
      c.eq(w, 'createdAt', iso(r.created_at), iso(d.createdAt))
      c.eq(w, 'updatedAt', iso(r.updated_at ?? r.created_at), iso(d.updatedAt))
    })
    each('events', (r, d, w) => {
      c.eq(w, 'type', r.type, d.type)
      c.eq(w, 'eventDate', iso(r.event_date), iso(d.eventDate))
      c.eq(w, 'startDate', iso(r.start_date), iso(d.startDate))
      c.eq(w, 'endDate', iso(r.end_date), iso(d.endDate))
      c.eq(w, 'dayOfWeek', r.day_of_week == null ? null : String(r.day_of_week), d.dayOfWeek ?? null)
      c.eq(w, 'mealOptions', Array.isArray(r.meal_options) ? r.meal_options : [], ((d.mealOptions as { label: string }[] | null) ?? []).map((m) => m.label))
      c.eq(w, 'cover.legacyUrl', expectedRelationUrl(r.cover_image_url), relationUrl(d.cover))
      c.eq(w, 'createdAt', iso(r.created_at), iso(d.createdAt))
    })
    each('event-rsvps', (r, d, w) => {
      c.eq(w, 'event', r.event_id, relId(d.event))
      c.eq(w, 'editToken', r.edit_token, d.editToken)
      c.eq(w, 'occurrenceDate', iso(r.occurrence_date), iso(d.occurrenceDate))
      c.eq(w, 'response', r.response, d.response)
      c.eq(w, 'meal', r.meal ?? '', d.meal ?? '')
      c.eq(w, 'createdAt', iso(r.created_at), iso(d.createdAt))
    })
    each('event-photos', (r, d, w) => {
      c.eq(w, 'event', r.event_id, relId(d.event))
      c.eq(w, 'status', r.status, d.status)
      c.eq(w, 'sortOrder', r.sort_order ?? 0, d.sortOrder)
      c.eq(w, 'submitterName', r.submitter_name ?? '', d.submitterName ?? '')
      c.eq(w, 'createdAt', iso(r.created_at), iso(d.createdAt))
    })
    each('stories', (r, d, w) => {
      for (const [lk, tk] of [
        ['slug', 'slug'],
        ['edit_token', 'editToken'],
        ['view_token', 'viewToken'],
        ['status', 'status'],
        ['title', 'title'],
        ['author_name', 'authorName'],
      ] as const)
        c.eq(w, tk, r[lk], d[tk])
      c.eq(w, 'excerpt', r.excerpt ?? '', d.excerpt ?? '')
      c.eq(w, 'authorEmail', r.author_email ?? '', d.authorEmail ?? '')
      c.eq(w, 'submittedByAdmin', Boolean(r.submitted_by_admin), Boolean(d.submittedByAdmin))
      c.eq(w, 'publishedAt', iso(r.published_at), iso(d.publishedAt))
      c.eq(w, 'reviewedAt', iso(r.reviewed_at), iso(d.reviewedAt))
      c.eq(w, 'coverImage.legacyUrl', expectedRelationUrl(r.cover_image_url), relationUrl(d.coverImage))
      c.eq(w, 'createdAt', iso(r.created_at), iso(d.createdAt))
      // WP4 findings: updatedAt = COALESCE(reviewed_at, published_at, created_at).
      c.eq(w, 'updatedAt', iso(r.reviewed_at ?? r.published_at ?? r.created_at), iso(d.updatedAt))
    })
    const honoursOf = new Map<number, LegacyRow[]>()
    for (const h of legacy.player_honours) honoursOf.set(h.player_id as number, [...(honoursOf.get(h.player_id as number) ?? []), h])
    each('players', (r, d, w) => {
      c.eq(w, 'slug', r.slug, d.slug)
      c.eq(w, 'source', r.source, d.source)
      c.eq(w, 'displayName', fullName(r.first_name as string, r.last_name as string), d.displayName)
      c.eq(w, 'isActiveDerived', Boolean(r.is_active_derived), Boolean(d.isActiveDerived))
      c.eq(w, 'hidden', Boolean(r.hidden), Boolean(d.hidden))
      c.eq(w, 'photo.legacyUrl', expectedRelationUrl(r.photo_url), relationUrl(d.photo))
      c.eq(
        w,
        'honours',
        (honoursOf.get(r.id as number) ?? []).map((h) => [h.years ?? '', h.title ?? '']),
        ((d.honours as { years: string; title: string }[] | null) ?? []).map((h) => [h.years ?? '', h.title ?? '']),
      )
      c.eq(w, 'createdAt', iso(r.created_at), iso(d.createdAt))
      c.eq(w, 'updatedAt', iso(r.updated_at ?? r.created_at), iso(d.updatedAt))
    })
    each('player-seasons', (r, d, w) => {
      c.eq(w, 'player', r.player_id, d.player)
      c.eq(w, 'seasonName', r.season_name, d.seasonName)
    })
    each('player-sync-runs', (r, d, w) => {
      c.eq(w, 'status', r.status, d.status)
      c.eq(w, 'startedAt', iso(r.started_at), iso(d.startedAt))
      c.eq(w, 'finishedAt', iso(r.finished_at), iso(d.finishedAt))
      c.eq(w, 'createdAt', iso(r.started_at), iso(d.createdAt))
    })
  }

  // ---- 2b. upload rows: the file is the legacy row's ------------------------------------
  // `--update` keeps an existing row's file, so the field checks above say nothing about it:
  // the row must carry the legacy url (or, when that is not importable, no file at all).
  {
    const c = check("upload rows: each row's file is its legacy row's")
    for (const collection of ['documents', 'gallery-photos', 'event-photos'] as const) {
      if (!want(collection) || !target[collection]) continue
      const owner = new Map<string, number>()
      for (const d of target[collection].values()) if (d.legacyUrl) owner.set(d.legacyUrl as string, d.id as number)
      for (const r of legacyOf[collection].filter(expected[collection])) {
        const d = target[collection].get(r.id as number)
        if (!d) continue
        const w = `${collection}#${r.id}`
        const wantUrl = expectedRelationUrl(r.url)
        const have = (d.legacyUrl as string | null | undefined) ?? null
        c.checked++
        if (wantUrl !== null) {
          if (have === wantUrl) continue
          const other = owner.get(wantUrl)
          if (have === null && !d.filename && other !== undefined && other !== r.id) {
            c.fail(`${w}: no file — its legacy url ${show(wantUrl)} is also ${collection}#${other}'s (legacyUrl is unique); the page would show an empty link/broken image`)
          } else {
            c.fail(`${w}.legacyUrl: legacy ${show(wantUrl)} ≠ target ${show(have)}${have === null && d.filename ? ` (target file ${show(d.filename)})` : ''}`)
          }
          continue
        }
        if (have !== null || d.filename) {
          c.fail(`${w}: target has a file (${show(have ?? d.filename)}) but legacy url ${show(r.url ?? '')} has none to import`)
          continue
        }
        const cl = classify(r.url, storeId)
        if (cl.kind === 'other') {
          c.fail(`${w}: no file — legacy url ${show(r.url)} is not an own-store Blob URL or /assets/ path (flagged by the ETL); the page would show an empty link/broken image`)
        } else if (cl.kind === 'local-asset') {
          c.note(`${w}: no file — public${cl.file} does not exist (already broken in legacy)`)
        }
      }
    }
  }

  // ---- 3. stories: plain text and inline images -----------------------------------------
  if (want('stories') && target.stories) {
    const text = check('stories: plain text equal (whitespace-normalised)')
    const images = check('stories: inline image count = legacy − drops')
    for (const r of legacy.stories.filter(expected.stories)) {
      const d = target.stories.get(r.id as number)
      if (!d) continue
      const html = legacyHtml(r as never)
      const content = d.content as StoryContent
      text.checked++
      const want = htmlPlainText(html)
      const got = htmlPlainText(lexicalToTiptapHtml(content))
      if (want !== got) text.fail(`stories#${r.id}: legacy ${show(want.slice(0, 160))} ≠ target ${show(got.slice(0, 160))}`)
      const { html: norm, droppedImages } = normaliseStoryHtml(html, { storeId })
      const srcs = [...norm.matchAll(/<img\b[^>]*\bsrc="([^"]*)"/gi)].map((m) => m[1].replace(/&amp;/g, '&'))
      const missing = srcs.filter((s) => !assetExists(s))
      const legacyCount = (html.match(/<img\b/gi) ?? []).length
      const expectedCount = srcs.length - missing.length
      const got2 = countUploadNodes(content)
      images.checked++
      if (droppedImages.length || missing.length) images.note(`stories#${r.id}: legacy ${legacyCount}, dropped ${droppedImages.length + missing.length}`)
      if (got2 !== expectedCount) images.fail(`stories#${r.id}: expected ${expectedCount} image(s) (legacy ${legacyCount} − ${droppedImages.length + missing.length} dropped), target has ${got2}`)
    }
  }

  // ---- 4. registered rows: plugin URL === legacyUrl --------------------------------------
  const uploadDocs: { collection: UploadCollection; doc: Doc }[] = []
  for (const collection of ['media', 'documents', 'gallery-photos', 'event-photos'] as UploadCollection[]) {
    const docs = collection === 'media' ? [...media.values()] : await all(collection, { where: { legacyUrl: { exists: true } } })
    for (const doc of docs) if (doc.legacyUrl) uploadDocs.push({ collection, doc })
  }
  const baseUrl = storeId ? `https://${storeId}.public.blob.vercel-storage.com` : ''
  const generateURL = await loadGenerateURL()
  const pluginUrl = (collection: UploadCollection, d: Doc) =>
    generateURL({ baseUrl, collectionPrefix: COLLECTION_PREFIX[collection], filename: d.filename as string, prefix: (d.prefix as string | null) ?? undefined })
  {
    const c = check('registered rows: generateURL(prefix, filename) = legacyUrl')
    if (!storeId) {
      c.note('no Blob token and no --blob-store-id: own-store URLs cannot be recognised; check skipped')
    } else {
      const fallbacks: string[] = []
      for (const { collection, doc: d } of uploadDocs) {
        const legacyUrl = d.legacyUrl as string
        if (classify(legacyUrl, storeId).kind !== 'own-blob') continue
        const url = d.filename ? pluginUrl(collection, d) : null
        // A fallback (§12.4) is exempt: in-run, by what the ETL did with this URL; standalone,
        // only a row stored under exactly the collection prefix (where the re-upload puts it).
        // A row the ETL registered in place must match, whatever its stored name now says.
        const action = opts.fileActions?.get(`${collection} ${legacyUrl}`)
        const fallback = action
          ? action.startsWith('fallback')
          : url !== legacyUrl && ((d.prefix as string | null) ?? '') === COLLECTION_PREFIX[collection]
        if (fallback) {
          fallbacks.push(`${collection}#${d.id} ${legacyUrl} → stored as ${show(`${d.prefix ? `${d.prefix}/` : ''}${d.filename}`)}`)
          continue
        }
        c.checked++
        if (url !== legacyUrl) c.fail(`${collection}#${d.id}: plugin URL ${url ?? '(no filename)'} ≠ legacyUrl ${legacyUrl}`)
      }
      if (fallbacks.length) c.note(`${fallbacks.length} fallback row(s) (not registered in place, §12.4; the legacyUrl read rule serves the original):`)
      for (const f of fallbacks) c.note(`  ${f}`)
    }
  }

  // ---- 5. sequences -----------------------------------------------------------------------
  {
    const c = check('sequences: next id > MAX(id) and legacy last_value')
    for (const { collection, legacyTable } of ID_PRESERVING) {
      if (!want(collection)) continue
      const next = await nextSequenceValue(payload, collection)
      const last = await source.sequenceLastValue(legacyTable)
      const max = Math.max(0, ...(target[collection]?.keys() ?? []))
      c.checked++
      if (next <= Math.max(max, last)) c.fail(`${collection}: next id ${next} ≤ max(MAX(id) ${max}, legacy last_value ${last})`)
    }
  }

  // ---- 6. HEAD sample (token only) ------------------------------------------------------
  // The plugin URL, not legacyUrl: legacyUrl is always reachable during cutover, the plugin URL
  // is what the app serves once the read rule is dropped (§13.5).
  if (token && storeId) {
    const c = check('upload reachability: HEAD generateURL(...), sampled across the upload collections')
    // A preview rehearsal writes to its own store: files registered in place live in the legacy
    // store (plugin URL = legacyUrl), everything the ETL uploaded lives in the token's store.
    const writeStoreId = storeIdFromToken(token)
    const writeBase = writeStoreId ? `https://${writeStoreId}.public.blob.vercel-storage.com` : baseUrl
    const headUrl = (collection: UploadCollection, d: Doc) => {
      const url = pluginUrl(collection, d)
      if (writeBase === baseUrl || url === d.legacyUrl) return url
      return generateURL({ baseUrl: writeBase, collectionPrefix: COLLECTION_PREFIX[collection], filename: d.filename as string, prefix: (d.prefix as string | null) ?? undefined })
    }
    const urls = uploadDocs.filter(({ doc }) => doc.filename).map(({ collection, doc }) => `${collection}#${doc.id} ${headUrl(collection, doc)}`)
    const sample = urls.sort(() => Math.random() - 0.5).slice(0, opts.headSample ?? 20)
    for (const entry of sample) {
      const u = entry.slice(entry.indexOf(' ') + 1)
      c.checked++
      try {
        const res = await fetch(u, { method: 'HEAD' })
        if (!res.ok) c.fail(`${entry}: HTTP ${res.status}`)
      } catch (err) {
        c.fail(`${entry}: ${(err as Error).message}`)
      }
    }
  }

  return { ok: checks.every((c) => c.ok), checks }
}

export function formatVerify(result: VerifyResult): string {
  const lines = [`VERIFY ${result.ok ? 'PASSED' : 'FAILED'}`]
  for (const c of result.checks) {
    lines.push(`  [${c.ok ? 'ok' : 'FAIL'}] ${c.name} (${c.checked} checked)`)
    for (const n of c.notes) lines.push(`        ${n}`)
    for (const f of c.failures) lines.push(`        ✗ ${f}`)
  }
  return lines.join('\n')
}
