# Stories/Blog Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Medium-like stories/blog feature under `/history` — admin writes and publishes stories with a rich Tiptap editor (inline images), any visitor can submit their own story with no login, and admin reviews/approves public submissions before they go live.

**Architecture:** New `stories` Postgres table (Drizzle). A shared `StoryEditor` client component wraps Tiptap identically for both admin and public forms. Content is stored as Tiptap JSON (source of truth) and rendered to HTML server-side on save (via `generateHTML` + a `jsdom` polyfill, since Tiptap's HTML generation needs a DOM even in Node) so public pages need zero client JS to display a post. Admin-authored stories publish immediately; public submissions land as `pending` and only appear once an admin approves them. Everything follows this codebase's existing pattern: Server Actions (no new JSON API routes except the two Vercel Blob upload endpoints, which already exist for other admin uploads).

**Tech Stack:** Next.js 14 (App Router), Drizzle ORM + Neon Postgres, Vercel Blob, Tiptap 2 (`@tiptap/react`, `@tiptap/core`, `@tiptap/starter-kit`, `@tiptap/extension-image`, `@tiptap/extension-link`), `jsdom` (server-side HTML rendering only), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-23-stories-blog-design.md`

## Global Constraints

- No new user-facing auth system — public submission stays unauthenticated by design (spec: "Public submission flow").
- No JSON API routes beyond the two Blob upload endpoints — everything else is a Server Action, matching every existing admin section (`app/admin/(shell)/*/actions.ts`).
- No CAPTCHA — spam defense is a honeypot field only (spec: "Out of scope" / "Open trade-offs"). This is an accepted trade-off, not a gap to fix.
- Blob-hosted images render via plain `<img>` (with `eslint-disable @next/next/no-img-element`), never `next/image` — matches the existing gallery convention and avoids touching `next.config.js`'s image `remotePatterns`.
- `contentHtml` is only ever produced by this app's own `renderStoryHtml()` from Tiptap JSON — never accept or store raw HTML from a request body directly (spec: "Public rendering" — this is what makes `dangerouslySetInnerHTML` safe here).
- Public submission's editor and admin's editor use the identical `StoryEditor` component and extension set — no feature split between them (spec was revised: "like Medium, we can add more pics in the post" applies to public submitters too).

## Review Focus

- A bot fills every field, including a hidden honeypot input — the submission must silently no-op, not insert a row. (Tested in Task 11.)
- A public submission is missing a required field (author name, title, or body) — must throw/error, not insert a partial row. (Tested in Task 11.)
- A public submission's body is technically non-empty Tiptap JSON but contains no real text (e.g. one empty paragraph) — must be rejected as empty, not saved as a blank published-looking story. (Tested in Task 11.)
- Visiting `/history/<slug>` for a story that exists but is `pending` or `rejected` — must 404, never render unapproved content just because the slug matches. (Tested in Task 5.)
- Two stories are submitted/created with the same or very similar title — slugs must not collide (silently overwriting or erroring). (Tested in Task 2.)

---

## Task 1: Install dependencies

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`

**Interfaces:**
- Produces: `@tiptap/react`, `@tiptap/core`, `@tiptap/starter-kit`, `@tiptap/extension-image`, `@tiptap/extension-link` (runtime deps), `jsdom` (dev dep, used only inside `lib/stories-content.ts` at runtime on the server — it's a real dependency of that module, but we install it as a devDependency the same way this repo already treats `tsx`; if your package manager complains at build time, install it as a regular dependency instead).

- [ ] **Step 1: Install the Tiptap packages and jsdom**

Run:
```bash
pnpm add @tiptap/react@^2 @tiptap/core@^2 @tiptap/starter-kit@^2 @tiptap/extension-image@^2 @tiptap/extension-link@^2
pnpm add -D jsdom @types/jsdom
```

- [ ] **Step 2: Verify the install resolves cleanly**

Run: `pnpm ls @tiptap/react @tiptap/core jsdom`
Expected: all three print a resolved version with no `UNMET DEPENDENCY` warnings.

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add tiptap and jsdom for the stories editor"
```

---

## Task 2: Slug helper

**Files:**
- Create: `lib/slugify.ts`
- Test: `tests/slugify.test.ts`

**Interfaces:**
- Produces: `slugify(input: string): string`, `makeUniqueSlug(title: string, isTaken: (slug: string) => Promise<boolean>): Promise<string>` — both consumed by Task 8 (admin actions) and Task 11 (public submit action).

- [ ] **Step 1: Write the failing test**

Create `tests/slugify.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { slugify, makeUniqueSlug } from '@/lib/slugify'

describe('slugify', () => {
  it('lowercases, strips punctuation and collapses separators', () => {
    expect(slugify("The Club's 50th Anniversary!")).toBe('the-clubs-50th-anniversary')
  })

  it('falls back to "story" for input with no usable characters', () => {
    expect(slugify('!!!')).toBe('story')
  })
})

describe('makeUniqueSlug', () => {
  it('returns the base slug when it is free', async () => {
    const slug = await makeUniqueSlug('Grand Final Recap', async () => false)
    expect(slug).toBe('grand-final-recap')
  })

  it('appends -2, -3, ... until a free slug is found', async () => {
    const taken = new Set(['grand-final-recap', 'grand-final-recap-2'])
    const slug = await makeUniqueSlug('Grand Final Recap', async (s) => taken.has(s))
    expect(slug).toBe('grand-final-recap-3')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/slugify.test.ts`
Expected: FAIL — `Cannot find module '@/lib/slugify'`

- [ ] **Step 3: Write the implementation**

Create `lib/slugify.ts`:

```ts
export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'story'
}

/** Appends -2, -3, ... to the base slug until `isTaken` reports one that's free. */
export async function makeUniqueSlug(
  title: string,
  isTaken: (slug: string) => Promise<boolean>
): Promise<string> {
  const base = slugify(title)
  let slug = base
  let n = 2
  while (await isTaken(slug)) {
    slug = `${base}-${n}`
    n += 1
  }
  return slug
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/slugify.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/slugify.ts tests/slugify.test.ts
git commit -m "feat: add slug generation helper for stories"
```

---

## Task 3: Story content rendering (Tiptap extensions + server-side HTML render)

**Files:**
- Create: `lib/stories-extensions.ts` (client + server safe — no `jsdom` import)
- Create: `lib/stories-content.ts` (server-only — imports `jsdom`)
- Test: `tests/stories-content.test.ts`

**Interfaces:**
- Produces: `STORY_EXTENSIONS` (from `lib/stories-extensions.ts`, consumed by Task 7's `StoryEditor` and by `lib/stories-content.ts` itself), `renderStoryHtml(doc: JSONContent): string`, `htmlToExcerpt(html: string, maxLen?: number): string` (from `lib/stories-content.ts`, consumed by Task 8 and Task 11's server actions).
- **Important:** `lib/stories-extensions.ts` must never import `jsdom` — it's imported by the client-side `StoryEditor` component in Task 7, and `jsdom` uses Node built-ins that break a browser bundle.

- [ ] **Step 1: Write the failing test**

Create `tests/stories-content.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { renderStoryHtml, htmlToExcerpt } from '@/lib/stories-content'

describe('renderStoryHtml', () => {
  it('renders headings, bold marks and images from a Tiptap document', () => {
    const html = renderStoryHtml({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Round 6' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'What a ' },
            { type: 'text', marks: [{ type: 'bold' }], text: 'win' },
          ],
        },
        { type: 'image', attrs: { src: 'https://example.com/photo.jpg', alt: null, title: null } },
      ],
    })
    expect(html).toContain('<h2>Round 6</h2>')
    expect(html).toContain('<strong>win</strong>')
    expect(html).toContain('src="https://example.com/photo.jpg"')
  })
})

describe('htmlToExcerpt', () => {
  it('strips tags and collapses whitespace', () => {
    expect(htmlToExcerpt('<p>Hello   <strong>world</strong></p>')).toBe('Hello world')
  })

  it('returns an empty string for content with no real text', () => {
    expect(htmlToExcerpt('<p></p>')).toBe('')
  })

  it('truncates long text at a word boundary and adds an ellipsis', () => {
    const html = '<p>' + 'word '.repeat(50) + '</p>'
    const excerpt = htmlToExcerpt(html, 20)
    expect(excerpt.length).toBeLessThanOrEqual(21)
    expect(excerpt.endsWith('…')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/stories-content.test.ts`
Expected: FAIL — `Cannot find module '@/lib/stories-content'`

- [ ] **Step 3: Write the extensions module**

Create `lib/stories-extensions.ts`:

```ts
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'

/** Shared Tiptap extension set used by the editor (client) and HTML rendering (server). */
export const STORY_EXTENSIONS = [
  StarterKit,
  Image,
  Link.configure({ openOnClick: false }),
]
```

- [ ] **Step 4: Write the server-side rendering module**

Create `lib/stories-content.ts`:

```ts
import { generateHTML, type JSONContent } from '@tiptap/core'
import { JSDOM } from 'jsdom'
import { STORY_EXTENSIONS } from './stories-extensions'

// Tiptap's generateHTML() needs a DOM even on the server (it throws
// "window is not defined" without one). Polyfill it once per process.
function ensureDom() {
  if (typeof document !== 'undefined') return
  const dom = new JSDOM('<!DOCTYPE html>')
  // @ts-expect-error - polyfilling globals for Tiptap's server-side render
  global.window = dom.window
  global.document = dom.window.document
}

/** Render a Tiptap document to HTML on the server, for storage and public rendering. */
export function renderStoryHtml(doc: JSONContent): string {
  ensureDom()
  return generateHTML(doc, STORY_EXTENSIONS)
}

/** Strip tags and collapse whitespace for a list-view excerpt. */
export function htmlToExcerpt(html: string, maxLen = 160): string {
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen).replace(/\s+\S*$/, '') + '…'
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run tests/stories-content.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add lib/stories-extensions.ts lib/stories-content.ts tests/stories-content.test.ts
git commit -m "feat: add Tiptap extensions and server-side HTML rendering for stories"
```

---

## Task 4: Database schema

**Files:**
- Modify: `db/schema.ts`

**Interfaces:**
- Produces: `stories` table, `type Story = typeof stories.$inferSelect` — consumed by Task 5, 8, 9, 10, 11, 12, 13.

- [ ] **Step 1: Add the table**

Modify `db/schema.ts` — change the top import and append the table at the end of the file:

```ts
import { pgTable, serial, text, timestamp, integer, jsonb, boolean } from 'drizzle-orm/pg-core'
```

Append:

```ts
export const stories = pgTable('stories', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  excerpt: text('excerpt').notNull().default(''),
  contentJson: jsonb('content_json').notNull(),
  contentHtml: text('content_html').notNull(),
  coverImageUrl: text('cover_image_url').notNull().default(''),
  authorName: text('author_name').notNull(),
  authorEmail: text('author_email').notNull().default(''),
  submittedByAdmin: boolean('submitted_by_admin').notNull().default(false),
  status: text('status').notNull().default('pending'), // 'pending' | 'published' | 'rejected'
  createdAt: timestamp('created_at').defaultNow().notNull(),
  publishedAt: timestamp('published_at'),
  reviewedAt: timestamp('reviewed_at'),
})

export type Story = typeof stories.$inferSelect
```

- [ ] **Step 2: Push the schema to the database**

Run: `pnpm db:push`
Expected: Drizzle Kit reports the new `stories` table created. This requires `DATABASE_URL` to be set (same as any other schema change in this repo — see `.env.local`).

- [ ] **Step 3: Verify the app still typechecks**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add db/schema.ts
git commit -m "feat: add stories table"
```

---

## Task 5: Public story queries

**Files:**
- Create: `lib/stories-queries.ts`
- Test: `tests/stories-queries.test.ts`

**Interfaces:**
- Consumes: `stories` table and `Story` type from `db/schema.ts` (Task 4).
- Produces: `listPublishedStories(): Promise<Story[]>`, `getPublishedStoryBySlug(slug: string): Promise<Story | null>` — consumed by Task 13 (public `/history` and `/history/[slug]` pages).

- [ ] **Step 1: Write the failing test**

Create `tests/stories-queries.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'

let selectResult: unknown[] = []

vi.mock('@/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(selectResult),
      }),
    }),
  },
}))

describe('getPublishedStoryBySlug', () => {
  it('returns null when no row matches the slug', async () => {
    selectResult = []
    const { getPublishedStoryBySlug } = await import('@/lib/stories-queries')
    expect(await getPublishedStoryBySlug('missing')).toBeNull()
  })

  it('returns null-shaped result for a slug that only matches a non-published row', async () => {
    // The query itself filters on status = 'published', so a pending/rejected
    // row with a matching slug never reaches this function as a row — the
    // fake db here models that by returning no rows, same as a true miss.
    selectResult = []
    const { getPublishedStoryBySlug } = await import('@/lib/stories-queries')
    expect(await getPublishedStoryBySlug('pending-story')).toBeNull()
  })

  it('returns the row when one matches', async () => {
    selectResult = [{ id: 1, slug: 'grand-final-recap', status: 'published' }]
    const { getPublishedStoryBySlug } = await import('@/lib/stories-queries')
    const result = await getPublishedStoryBySlug('grand-final-recap')
    expect(result?.slug).toBe('grand-final-recap')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/stories-queries.test.ts`
Expected: FAIL — `Cannot find module '@/lib/stories-queries'`

- [ ] **Step 3: Write the implementation**

Create `lib/stories-queries.ts`:

```ts
import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { stories, type Story } from '@/db/schema'

export async function listPublishedStories(): Promise<Story[]> {
  return db.select().from(stories).where(eq(stories.status, 'published')).orderBy(desc(stories.publishedAt))
}

export async function getPublishedStoryBySlug(slug: string): Promise<Story | null> {
  const rows = await db
    .select()
    .from(stories)
    .where(and(eq(stories.slug, slug), eq(stories.status, 'published')))
  return (rows[0] as Story | undefined) ?? null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/stories-queries.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/stories-queries.ts tests/stories-queries.test.ts
git commit -m "feat: add public story query helpers"
```

---

## Task 6: Blob upload plumbing

**Files:**
- Modify: `app/api/admin/upload/route.ts:6` (add `'stories/'` to `ALLOWED_PREFIXES`)
- Create: `app/api/stories/upload/route.ts` (new, unauthenticated, image-only)
- Modify: `lib/blob-client.ts`

**Interfaces:**
- Produces: `uploadToBlob(file: File, prefix: 'gallery' | 'sponsors' | 'documents' | 'stories'): Promise<string>` (extended union, admin-authenticated), `uploadPublicStoryImage(file: File): Promise<string>` (new, unauthenticated) — both consumed by Task 7's `StoryEditor` via the parent form's choice of upload function.

- [ ] **Step 1: Allow the `stories/` prefix on the existing admin upload route**

Modify `app/api/admin/upload/route.ts` line 6:

```ts
const ALLOWED_PREFIXES = ['gallery/', 'sponsors/', 'documents/', 'stories/']
```

- [ ] **Step 2: Add the public, unauthenticated stories upload route**

Create `app/api/stories/upload/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'

// Unauthenticated on purpose: public visitors submit stories without logging
// in. Locked down hard to limit abuse: images only, 8MB cap, and every
// pathname must fall under stories/pending/ (checked below), so
// pending-submission images are easy to distinguish from admin-authored ones.
export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody
  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith('stories/pending/')) {
          throw new Error('Invalid upload path')
        }
        return {
          allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'],
          maximumSizeInBytes: 8 * 1024 * 1024,
          addRandomSuffix: true,
        }
      },
      onUploadCompleted: async () => {},
    })
    return NextResponse.json(json)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
}
```

- [ ] **Step 3: Extend the client-side blob helper**

Modify `lib/blob-client.ts` — replace the existing `uploadToBlob` function with:

```ts
/** Upload straight from the browser to Vercel Blob under `prefix/` and return the public URL. Requires the admin session (routes through /api/admin/upload). */
export async function uploadToBlob(
  file: File,
  prefix: 'gallery' | 'sponsors' | 'documents' | 'stories'
): Promise<string> {
  const blob = await upload(`${prefix}/${file.name}`, file, {
    access: 'public',
    handleUploadUrl: '/api/admin/upload',
  })
  return blob.url
}

/** Upload a story image with no admin session required (public submission form). */
export async function uploadPublicStoryImage(file: File): Promise<string> {
  const blob = await upload(`stories/pending/${file.name}`, file, {
    access: 'public',
    handleUploadUrl: '/api/stories/upload',
  })
  return blob.url
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Manual verification**

This route only matters at runtime against real Vercel Blob credentials, which isn't something Vitest can exercise. Run `pnpm dev`, then from the browser console on any page:

```js
fetch('/api/stories/upload', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ type: 'blob.generate-client-token', payload: { pathname: 'not-allowed/x.jpg', callbackUrl: '', clientPayload: null, multipart: false } }),
}).then((r) => r.json()).then(console.log)
```

Expected: `{ error: "Invalid upload path" }` (400) — confirming the path guard rejects anything outside `stories/pending/`.

- [ ] **Step 6: Commit**

```bash
git add app/api/admin/upload/route.ts app/api/stories/upload/route.ts lib/blob-client.ts
git commit -m "feat: add public image upload route for story submissions"
```

---

## Task 7: Shared StoryEditor component

**Files:**
- Create: `components/stories/story-editor.tsx`
- Modify: `app/globals.css` (add `.story-content` styling — no `@tailwindcss/typography` plugin is installed in this project, so rendered/edited content needs its own rules)

**Interfaces:**
- Consumes: `STORY_EXTENSIONS` from `lib/stories-extensions.ts` (Task 3), `optimiseImage` from `lib/blob-client.ts` (existing).
- Produces: `<StoryEditor name={string} initialContent={JSONContent | undefined} uploadImage={(file: File) => Promise<string>} />` — a hidden `<input type="hidden" name={name}>` inside it carries the serialized Tiptap JSON so it participates in the surrounding `<form>`. Consumed by Task 10 (admin new/edit pages) and Task 12 (public submission page).

- [ ] **Step 1: Add story-content styling**

Modify `app/globals.css` — inside the existing `@layer components { ... }` block (after `.container-site`), add:

```css
  /* Shared styling for both the live Tiptap editor and rendered story HTML. */
  .story-content {
    @apply text-brand-charcoal;
  }
  .story-content h2 {
    @apply font-heading mb-3 mt-6 text-2xl font-bold text-brand-black first:mt-0;
  }
  .story-content h3 {
    @apply font-heading mb-2 mt-5 text-xl font-bold text-brand-black;
  }
  .story-content p {
    @apply mb-4 leading-relaxed;
  }
  .story-content ul {
    @apply mb-4 list-disc pl-6;
  }
  .story-content ol {
    @apply mb-4 list-decimal pl-6;
  }
  .story-content blockquote {
    @apply my-4 border-l-4 border-brand-gold pl-4 italic text-brand-grey;
  }
  .story-content img {
    @apply my-4 w-full rounded-xl;
  }
  .story-content a {
    @apply text-brand-gold-deep underline underline-offset-2;
  }
  .story-content .ProseMirror:focus {
    @apply outline-none;
  }
```

- [ ] **Step 2: Write the editor component**

Create `components/stories/story-editor.tsx`:

```tsx
'use client'

import { useCallback, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import type { JSONContent } from '@tiptap/core'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  BoldIcon,
  ItalicIcon,
  Image01Icon,
  Link01Icon,
  Heading02Icon,
  ListViewIcon,
  QuoteUpIcon,
} from '@hugeicons/core-free-icons'
import { STORY_EXTENSIONS } from '@/lib/stories-extensions'
import { optimiseImage } from '@/lib/blob-client'
import { cn } from '@/lib/utils'

const EMPTY_DOC: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] }

type Props = {
  /** Name of the hidden form field this editor serialises its Tiptap JSON into. */
  name: string
  initialContent?: JSONContent
  /** Uploads an image file and returns its public URL. Differs between the admin editor (authenticated route) and the public submission form (unauthenticated route). */
  uploadImage: (file: File) => Promise<string>
}

export function StoryEditor({ name, initialContent, uploadImage }: Props) {
  const hiddenRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkValue, setLinkValue] = useState('')
  const [uploading, setUploading] = useState(false)

  const editor = useEditor({
    extensions: STORY_EXTENSIONS,
    content: initialContent ?? EMPTY_DOC,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      if (hiddenRef.current) hiddenRef.current.value = JSON.stringify(editor.getJSON())
    },
  })

  const insertImage = useCallback(
    async (file: File) => {
      if (!editor) return
      setUploading(true)
      try {
        const prepared = await optimiseImage(file, { maxEdge: 1600 })
        const url = await uploadImage(prepared)
        editor.chain().focus().setImage({ src: url }).run()
        if (hiddenRef.current) hiddenRef.current.value = JSON.stringify(editor.getJSON())
      } finally {
        setUploading(false)
      }
    },
    [editor, uploadImage]
  )

  if (!editor) return null

  const toolbarBtn = (active: boolean) =>
    cn(
      'inline-flex h-9 min-w-9 items-center justify-center rounded-md px-2 text-sm text-brand-charcoal transition hover:bg-brand-stone',
      active && 'bg-brand-gold-pale text-brand-gold-deep'
    )

  return (
    <div className="rounded-lg border border-brand-black/15 bg-white">
      <div className="flex flex-wrap items-center gap-1 border-b border-brand-black/10 p-2">
        <button
          type="button"
          className={toolbarBtn(editor.isActive('heading', { level: 2 }))}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          aria-label="Heading"
        >
          <HugeiconsIcon icon={Heading02Icon} className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          className={toolbarBtn(editor.isActive('bold'))}
          onClick={() => editor.chain().focus().toggleBold().run()}
          aria-label="Bold"
        >
          <HugeiconsIcon icon={BoldIcon} className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          className={toolbarBtn(editor.isActive('italic'))}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          aria-label="Italic"
        >
          <HugeiconsIcon icon={ItalicIcon} className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          className={toolbarBtn(editor.isActive('bulletList'))}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          aria-label="Bulleted list"
        >
          <HugeiconsIcon icon={ListViewIcon} className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          className={toolbarBtn(editor.isActive('blockquote'))}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          aria-label="Quote"
        >
          <HugeiconsIcon icon={QuoteUpIcon} className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          className={toolbarBtn(editor.isActive('link'))}
          onClick={() => {
            setLinkValue((editor.getAttributes('link').href as string) ?? '')
            setLinkOpen((v) => !v)
          }}
          aria-label="Link"
        >
          <HugeiconsIcon icon={Link01Icon} className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          className={toolbarBtn(false)}
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          aria-label="Insert image"
        >
          <HugeiconsIcon icon={Image01Icon} className="h-4 w-4" aria-hidden />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) insertImage(file)
            e.target.value = ''
          }}
        />
        {uploading && <span className="text-xs text-brand-grey">Uploading…</span>}
      </div>

      {linkOpen && (
        <div className="flex items-center gap-2 border-b border-brand-black/10 p-2">
          <input
            type="url"
            value={linkValue}
            onChange={(e) => setLinkValue(e.target.value)}
            placeholder="https://…"
            className="h-9 flex-1 rounded-md border border-brand-black/15 px-2 text-sm"
          />
          <button
            type="button"
            className="h-9 shrink-0 rounded-md bg-brand-black px-3 text-xs font-semibold text-white"
            onClick={() => {
              if (linkValue) {
                editor.chain().focus().extendMarkRange('link').setLink({ href: linkValue }).run()
              } else {
                editor.chain().focus().unsetLink().run()
              }
              if (hiddenRef.current) hiddenRef.current.value = JSON.stringify(editor.getJSON())
              setLinkOpen(false)
            }}
          >
            Apply
          </button>
        </div>
      )}

      <EditorContent editor={editor} className="story-content min-h-64 px-4 py-3" />
      <input ref={hiddenRef} type="hidden" name={name} defaultValue={JSON.stringify(initialContent ?? EMPTY_DOC)} />
    </div>
  )
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add components/stories/story-editor.tsx app/globals.css
git commit -m "feat: add shared Tiptap story editor component"
```

---

## Task 8: Admin story actions

**Files:**
- Create: `app/admin/(shell)/stories/actions.ts`
- Test: `tests/stories-admin-actions.test.ts`

**Interfaces:**
- Consumes: `stories` table + `Story` type (Task 4), `makeUniqueSlug` (Task 2), `renderStoryHtml`/`htmlToExcerpt` (Task 3).
- Produces: `listStories(): Promise<Story[]>`, `getStoryById(id: number): Promise<Story | null>`, `createStory(formData: FormData): Promise<void>`, `updateStory(id: number, formData: FormData): Promise<void>`, `approveStory(id: number): Promise<void>`, `rejectStory(id: number): Promise<void>` — all consumed by Task 9 (review page) and Task 10 (new/edit pages).

- [ ] **Step 1: Write the failing test**

Create `tests/stories-admin-actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

let inserted: Record<string, unknown> | null = null
let updated: Record<string, unknown> | null = null

vi.mock('@/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }),
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        inserted = v
        return Promise.resolve()
      },
    }),
    update: () => ({
      set: (v: Record<string, unknown>) => ({
        where: () => {
          updated = v
          return Promise.resolve()
        },
      }),
    }),
  },
}))

beforeEach(() => {
  inserted = null
  updated = null
})

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

const SAMPLE_DOC = JSON.stringify({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A short story about round six.' }] }],
})

describe('createStory', () => {
  it('publishes immediately with a generated slug and derived excerpt', async () => {
    const { createStory } = await import('@/app/admin/(shell)/stories/actions')
    await createStory(formData({ title: 'Grand Final Recap', contentJson: SAMPLE_DOC }))

    expect(inserted).toMatchObject({
      slug: 'grand-final-recap',
      title: 'Grand Final Recap',
      status: 'published',
      submittedByAdmin: true,
      authorName: 'Lang Lang Cricket Club',
    })
    expect((inserted!.excerpt as string)).toContain('A short story about round six.')
    expect(inserted!.publishedAt).toBeInstanceOf(Date)
  })

  it('rejects a story with no title', async () => {
    const { createStory } = await import('@/app/admin/(shell)/stories/actions')
    await expect(createStory(formData({ title: '', contentJson: SAMPLE_DOC }))).rejects.toThrow(
      'Title is required.'
    )
  })
})

describe('approveStory / rejectStory', () => {
  it('approveStory publishes and stamps publishedAt/reviewedAt', async () => {
    const { approveStory } = await import('@/app/admin/(shell)/stories/actions')
    await approveStory(1)
    expect(updated).toMatchObject({ status: 'published' })
    expect(updated!.publishedAt).toBeInstanceOf(Date)
    expect(updated!.reviewedAt).toBeInstanceOf(Date)
  })

  it('rejectStory marks rejected without setting publishedAt', async () => {
    const { rejectStory } = await import('@/app/admin/(shell)/stories/actions')
    await rejectStory(1)
    expect(updated).toMatchObject({ status: 'rejected' })
    expect(updated!.publishedAt).toBeUndefined()
    expect(updated!.reviewedAt).toBeInstanceOf(Date)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/stories-admin-actions.test.ts`
Expected: FAIL — `Cannot find module '@/app/admin/(shell)/stories/actions'`

- [ ] **Step 3: Write the implementation**

Create `app/admin/(shell)/stories/actions.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import type { JSONContent } from '@tiptap/core'
import { db } from '@/db'
import { stories, type Story } from '@/db/schema'
import { makeUniqueSlug } from '@/lib/slugify'
import { renderStoryHtml, htmlToExcerpt } from '@/lib/stories-content'

async function slugIsTaken(slug: string): Promise<boolean> {
  const rows = await db.select({ id: stories.id }).from(stories).where(eq(stories.slug, slug))
  return rows.length > 0
}

function parseContentJson(raw: FormDataEntryValue | null): JSONContent {
  if (!raw) throw new Error('Story body is required.')
  return JSON.parse(String(raw)) as JSONContent
}

export async function listStories(): Promise<Story[]> {
  return db.select().from(stories).orderBy(stories.createdAt) as unknown as Promise<Story[]>
}

export async function getStoryById(id: number): Promise<Story | null> {
  const rows = await db.select().from(stories).where(eq(stories.id, id))
  return (rows[0] as Story | undefined) ?? null
}

export async function createStory(formData: FormData) {
  const title = String(formData.get('title') ?? '').trim()
  if (!title) throw new Error('Title is required.')
  const contentJson = parseContentJson(formData.get('contentJson'))
  const contentHtml = renderStoryHtml(contentJson)
  const excerptInput = String(formData.get('excerpt') ?? '').trim()
  const slug = await makeUniqueSlug(title, slugIsTaken)

  await db.insert(stories).values({
    slug,
    title,
    excerpt: excerptInput || htmlToExcerpt(contentHtml),
    contentJson,
    contentHtml,
    coverImageUrl: String(formData.get('coverImageUrl') ?? ''),
    authorName: String(formData.get('authorName') ?? '').trim() || 'Lang Lang Cricket Club',
    authorEmail: '',
    submittedByAdmin: true,
    status: 'published',
    publishedAt: new Date(),
  })

  revalidatePath('/admin/stories')
  revalidatePath('/history')
}

export async function updateStory(id: number, formData: FormData) {
  const title = String(formData.get('title') ?? '').trim()
  if (!title) throw new Error('Title is required.')
  const contentJson = parseContentJson(formData.get('contentJson'))
  const contentHtml = renderStoryHtml(contentJson)
  const excerptInput = String(formData.get('excerpt') ?? '').trim()

  await db
    .update(stories)
    .set({
      title,
      excerpt: excerptInput || htmlToExcerpt(contentHtml),
      contentJson,
      contentHtml,
      coverImageUrl: String(formData.get('coverImageUrl') ?? ''),
      authorName: String(formData.get('authorName') ?? '').trim() || 'Lang Lang Cricket Club',
    })
    .where(eq(stories.id, id))

  revalidatePath('/admin/stories')
  revalidatePath('/history')
}

export async function approveStory(id: number) {
  await db
    .update(stories)
    .set({ status: 'published', publishedAt: new Date(), reviewedAt: new Date() })
    .where(eq(stories.id, id))
  revalidatePath('/admin/stories')
  revalidatePath('/history')
}

/** Also used to unpublish an already-published story (spec: same status, one fewer state to manage). */
export async function rejectStory(id: number) {
  await db.update(stories).set({ status: 'rejected', reviewedAt: new Date() }).where(eq(stories.id, id))
  revalidatePath('/admin/stories')
  revalidatePath('/history')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/stories-admin-actions.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add "app/admin/(shell)/stories/actions.ts" tests/stories-admin-actions.test.ts
git commit -m "feat: add admin story server actions"
```

---

## Task 9: Admin stories review page + nav link

**Files:**
- Create: `app/admin/(shell)/stories/page.tsx`
- Modify: `components/admin/admin-nav.tsx:9-16` (add the "Stories" link)

**Interfaces:**
- Consumes: `listStories`, `approveStory`, `rejectStory` (Task 8), `AdminPageHeader`, `AdminCard`, `EmptyState`, `ActionForm`, `SubmitButton`, `Button`, `buttonVariants` (existing).

- [ ] **Step 1: Add the nav link**

Modify `components/admin/admin-nav.tsx` — in the `links` array, add an entry after `'/admin/gallery'`:

```ts
const links = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/documents', label: 'Documents' },
  { href: '/admin/gallery', label: 'Gallery' },
  { href: '/admin/stories', label: 'Stories' },
  { href: '/admin/sponsors', label: 'Sponsors' },
  { href: '/admin/contacts', label: 'Contacts' },
  { href: '/admin/playhq', label: 'PlayHQ' },
]
```

- [ ] **Step 2: Write the review page**

Create `app/admin/(shell)/stories/page.tsx`:

```tsx
import Link from 'next/link'
import { listStories, approveStory, rejectStory } from './actions'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { AdminCard, EmptyState } from '@/components/admin/admin-card'
import { ActionForm, SubmitButton } from '@/components/admin/action-form'
import { Button, buttonVariants } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

export default async function StoriesAdminPage() {
  const all = await listStories()
  const pending = all.filter((s) => s.status === 'pending')
  const published = all.filter((s) => s.status === 'published')

  return (
    <main>
      <AdminPageHeader
        eyebrow="Stories"
        title="Stories"
        intro="Review submissions from the community and publish the club's own stories."
      >
        <Link href="/admin/stories/new" className={buttonVariants({ variant: 'brand', size: 'xl' })}>
          New story
        </Link>
      </AdminPageHeader>

      <AdminCard
        title="Pending review"
        aside={<span className="text-sm text-brand-grey">{pending.length} waiting</span>}
        className="mb-8"
      >
        {pending.length === 0 ? (
          <EmptyState>Nothing waiting on review.</EmptyState>
        ) : (
          <ul className="flex flex-col gap-4">
            {pending.map((s) => (
              <li key={s.id} className="rounded-xl border border-brand-black/10 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-brand-black">{s.title}</p>
                    <p className="text-sm text-brand-grey">
                      {s.authorName}
                      {s.authorEmail ? ` · ${s.authorEmail}` : ''} · {s.createdAt.toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <ActionForm action={rejectStory.bind(null, s.id)}>
                      <SubmitButton variant="outline" pendingText="Rejecting…">
                        Reject
                      </SubmitButton>
                    </ActionForm>
                    <ActionForm action={approveStory.bind(null, s.id)}>
                      <SubmitButton pendingText="Approving…">Approve</SubmitButton>
                    </ActionForm>
                  </div>
                </div>
                {/* eslint-disable-next-line react/no-danger -- content only ever comes from this app's own Tiptap editor, see lib/stories-content.ts */}
                <div
                  className="story-content mt-3 max-h-48 overflow-y-auto rounded-lg bg-brand-stone/60 p-3 text-sm"
                  dangerouslySetInnerHTML={{ __html: s.contentHtml }}
                />
              </li>
            ))}
          </ul>
        )}
      </AdminCard>

      <AdminCard
        title="Published"
        aside={<span className="text-sm text-brand-grey">{published.length} total</span>}
        flush
      >
        {published.length === 0 ? (
          <EmptyState>No stories published yet.</EmptyState>
        ) : (
          <ul className="divide-y divide-brand-black/5">
            {published.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-semibold text-brand-black">{s.title}</p>
                  <p className="text-sm text-brand-grey">
                    {s.authorName} · {s.publishedAt?.toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/admin/stories/${s.id}/edit`}
                    className={buttonVariants({ variant: 'outline', size: 'sm', className: 'min-h-11' })}
                  >
                    Edit
                  </Link>
                  <ActionForm action={rejectStory.bind(null, s.id)}>
                    <SubmitButton variant="outline" pendingText="Unpublishing…">
                      Unpublish
                    </SubmitButton>
                  </ActionForm>
                </div>
              </li>
            ))}
          </ul>
        )}
      </AdminCard>
    </main>
  )
}
```

Note: `Button` is imported but unused if you follow this exactly — remove the `Button` import (keep only `buttonVariants`) to avoid an unused-import lint error:

```ts
import { buttonVariants } from '@/components/ui/button'
```

- [ ] **Step 3: Typecheck and lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "app/admin/(shell)/stories/page.tsx" components/admin/admin-nav.tsx
git commit -m "feat: add admin stories review page"
```

---

## Task 10: Admin new/edit story pages

**Files:**
- Create: `app/admin/(shell)/stories/new/page.tsx`
- Create: `app/admin/(shell)/stories/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: `createStory`, `updateStory`, `getStoryById` (Task 8), `StoryEditor` (Task 7), `uploadToBlob` (Task 6), `AdminPageHeader`, `Field`, `TextInput`, `FileInput`, `ActionForm`, `SubmitButton` (existing).

- [ ] **Step 1: Write the "new story" page**

Create `app/admin/(shell)/stories/new/page.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createStory } from '../actions'
import { StoryEditor } from '@/components/stories/story-editor'
import { uploadToBlob, optimiseImage } from '@/lib/blob-client'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { AdminCard } from '@/components/admin/admin-card'
import { Field, TextInput, FileInput, TextArea } from '@/components/admin/fields'
import { Button } from '@/components/ui/button'

export default function NewStoryPage() {
  const router = useRouter()
  const [coverUrl, setCoverUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const prepared = await optimiseImage(file, { maxEdge: 1600 })
    setCoverUrl(await uploadToBlob(prepared, 'stories'))
  }

  async function onSubmit(formData: FormData) {
    setBusy(true)
    setError(null)
    formData.set('coverImageUrl', coverUrl)
    try {
      await createStory(formData)
      router.push('/admin/stories')
      router.refresh()
    } catch (err) {
      setError((err as Error).message || 'Could not save the story.')
      setBusy(false)
    }
  }

  return (
    <main>
      <AdminPageHeader eyebrow="Stories" title="New story" intro="Publishes immediately." />
      <AdminCard>
        <form action={onSubmit} className="flex flex-col gap-5">
          <Field label="Title" htmlFor="story-title">
            <TextInput id="story-title" name="title" required />
          </Field>
          <Field label="Author name" htmlFor="story-author" hint="Defaults to the club if left blank.">
            <TextInput id="story-author" name="authorName" placeholder="Lang Lang Cricket Club" />
          </Field>
          <Field label="Excerpt" htmlFor="story-excerpt" hint="Optional — auto-generated from the body if left blank.">
            <TextArea id="story-excerpt" name="excerpt" />
          </Field>
          <Field label="Cover image" htmlFor="story-cover" hint="Optional.">
            <FileInput id="story-cover" accept="image/*" onChange={onCoverChange} />
          </Field>
          <Field label="Story" htmlFor="story-body">
            <StoryEditor name="contentJson" uploadImage={(file) => uploadToBlob(file, 'stories')} />
          </Field>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <div>
            <Button type="submit" size="xl" variant="brand" disabled={busy}>
              {busy ? 'Publishing…' : 'Publish'}
            </Button>
          </div>
        </form>
      </AdminCard>
    </main>
  )
}
```

- [ ] **Step 2: Write the "edit story" page**

Create `app/admin/(shell)/stories/[id]/edit/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { getStoryById } from '../../actions'
import { EditStoryForm } from './edit-story-form'

export default async function EditStoryPage({ params }: { params: { id: string } }) {
  const id = Number(params.id)
  const story = await getStoryById(id)
  if (!story) notFound()

  return (
    <main>
      <EditStoryForm
        id={story.id}
        initialTitle={story.title}
        initialAuthorName={story.authorName}
        initialExcerpt={story.excerpt}
        initialCoverUrl={story.coverImageUrl}
        initialContent={story.contentJson as never}
      />
    </main>
  )
}
```

Create `app/admin/(shell)/stories/[id]/edit/edit-story-form.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { JSONContent } from '@tiptap/core'
import { updateStory } from '../../actions'
import { StoryEditor } from '@/components/stories/story-editor'
import { uploadToBlob, optimiseImage } from '@/lib/blob-client'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { AdminCard } from '@/components/admin/admin-card'
import { Field, TextInput, FileInput, TextArea } from '@/components/admin/fields'
import { Button } from '@/components/ui/button'

type Props = {
  id: number
  initialTitle: string
  initialAuthorName: string
  initialExcerpt: string
  initialCoverUrl: string
  initialContent: JSONContent
}

export function EditStoryForm({ id, initialTitle, initialAuthorName, initialExcerpt, initialCoverUrl, initialContent }: Props) {
  const router = useRouter()
  const [coverUrl, setCoverUrl] = useState(initialCoverUrl)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const prepared = await optimiseImage(file, { maxEdge: 1600 })
    setCoverUrl(await uploadToBlob(prepared, 'stories'))
  }

  async function onSubmit(formData: FormData) {
    setBusy(true)
    setError(null)
    formData.set('coverImageUrl', coverUrl)
    try {
      await updateStory(id, formData)
      router.push('/admin/stories')
      router.refresh()
    } catch (err) {
      setError((err as Error).message || 'Could not save the story.')
      setBusy(false)
    }
  }

  return (
    <>
      <AdminPageHeader eyebrow="Stories" title="Edit story" />
      <AdminCard>
        <form action={onSubmit} className="flex flex-col gap-5">
          <Field label="Title" htmlFor="story-title">
            <TextInput id="story-title" name="title" defaultValue={initialTitle} required />
          </Field>
          <Field label="Author name" htmlFor="story-author">
            <TextInput id="story-author" name="authorName" defaultValue={initialAuthorName} />
          </Field>
          <Field label="Excerpt" htmlFor="story-excerpt">
            <TextArea id="story-excerpt" name="excerpt" defaultValue={initialExcerpt} />
          </Field>
          <Field label="Cover image" htmlFor="story-cover">
            <FileInput id="story-cover" accept="image/*" onChange={onCoverChange} />
            {coverUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coverUrl} alt="" className="mt-2 aspect-video w-full max-w-sm rounded-lg object-cover" />
            )}
          </Field>
          <Field label="Story" htmlFor="story-body">
            <StoryEditor name="contentJson" initialContent={initialContent} uploadImage={(file) => uploadToBlob(file, 'stories')} />
          </Field>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <div>
            <Button type="submit" size="xl" variant="brand" disabled={busy}>
              {busy ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </form>
      </AdminCard>
    </>
  )
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "app/admin/(shell)/stories/new" "app/admin/(shell)/stories/[id]"
git commit -m "feat: add admin new/edit story pages"
```

---

## Task 11: Public submission action

**Files:**
- Create: `app/history/submit/actions.ts`
- Test: `tests/stories-submit-action.test.ts`

**Interfaces:**
- Consumes: `stories` table (Task 4), `makeUniqueSlug` (Task 2), `renderStoryHtml`/`htmlToExcerpt` (Task 3).
- Produces: `submitStory(formData: FormData): Promise<void>` — consumed by Task 12 (public submission page).

- [ ] **Step 1: Write the failing test**

Create `tests/stories-submit-action.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

let inserted: Record<string, unknown> | null = null

vi.mock('@/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }),
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        inserted = v
        return Promise.resolve()
      },
    }),
  },
}))

beforeEach(() => {
  inserted = null
})

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

const SAMPLE_DOC = JSON.stringify({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'My first season with the seniors.' }] }],
})

const EMPTY_DOC = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] })

describe('submitStory', () => {
  it('inserts a pending row for a valid submission', async () => {
    const { submitStory } = await import('@/app/history/submit/actions')
    await expect(
      submitStory(formData({ authorName: 'Pat Smith', title: 'My First Season', contentJson: SAMPLE_DOC }))
    ).rejects.toBeDefined() // next/navigation's redirect() always throws, even on success

    expect(inserted).toMatchObject({
      title: 'My First Season',
      authorName: 'Pat Smith',
      status: 'pending',
      submittedByAdmin: false,
    })
  })

  it('rejects submissions missing required fields without inserting anything', async () => {
    const { submitStory } = await import('@/app/history/submit/actions')
    await expect(
      submitStory(formData({ authorName: '', title: '', contentJson: SAMPLE_DOC }))
    ).rejects.toThrow('Name, title and story body are required.')
    expect(inserted).toBeNull()
  })

  it('rejects a body with no real text without inserting anything', async () => {
    const { submitStory } = await import('@/app/history/submit/actions')
    await expect(
      submitStory(formData({ authorName: 'Pat Smith', title: 'Empty Story', contentJson: EMPTY_DOC }))
    ).rejects.toThrow('Story body cannot be empty.')
    expect(inserted).toBeNull()
  })

  it('silently no-ops when the honeypot field is filled in', async () => {
    const { submitStory } = await import('@/app/history/submit/actions')
    await expect(
      submitStory(
        formData({
          authorName: 'Bot',
          title: 'Buy now',
          contentJson: SAMPLE_DOC,
          website: 'http://spam.example',
        })
      )
    ).rejects.toBeDefined() // redirect() throws
    expect(inserted).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/stories-submit-action.test.ts`
Expected: FAIL — `Cannot find module '@/app/history/submit/actions'`

- [ ] **Step 3: Write the implementation**

Create `app/history/submit/actions.ts`:

```ts
'use server'

import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import type { JSONContent } from '@tiptap/core'
import { db } from '@/db'
import { stories } from '@/db/schema'
import { makeUniqueSlug } from '@/lib/slugify'
import { renderStoryHtml, htmlToExcerpt } from '@/lib/stories-content'

async function slugIsTaken(slug: string): Promise<boolean> {
  const rows = await db.select({ id: stories.id }).from(stories).where(eq(stories.slug, slug))
  return rows.length > 0
}

export async function submitStory(formData: FormData) {
  // Honeypot: real visitors never see or fill this hidden field. A bot that
  // fills every field does — pretend success without writing anything, so
  // as not to tip it off.
  if (String(formData.get('website') ?? '').trim() !== '') {
    redirect('/history/submit?submitted=1')
  }

  const title = String(formData.get('title') ?? '').trim()
  const authorName = String(formData.get('authorName') ?? '').trim()
  const rawContent = formData.get('contentJson')
  if (!title || !authorName || !rawContent) {
    throw new Error('Name, title and story body are required.')
  }

  const contentJson = JSON.parse(String(rawContent)) as JSONContent
  const contentHtml = renderStoryHtml(contentJson)
  const excerpt = htmlToExcerpt(contentHtml)
  if (!excerpt) {
    throw new Error('Story body cannot be empty.')
  }

  const slug = await makeUniqueSlug(title, slugIsTaken)

  await db.insert(stories).values({
    slug,
    title,
    excerpt,
    contentJson,
    contentHtml,
    coverImageUrl: String(formData.get('coverImageUrl') ?? ''),
    authorName,
    authorEmail: String(formData.get('authorEmail') ?? '').trim(),
    submittedByAdmin: false,
    status: 'pending',
  })

  redirect('/history/submit?submitted=1')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/stories-submit-action.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add app/history/submit/actions.ts tests/stories-submit-action.test.ts
git commit -m "feat: add public story submission action with honeypot spam guard"
```

---

## Task 12: Public submission page

**Files:**
- Create: `app/history/submit/page.tsx`

**Interfaces:**
- Consumes: `submitStory` (Task 11), `StoryEditor` (Task 7), `uploadPublicStoryImage`/`optimiseImage` (Task 6/existing), `PageHeader` (existing).

- [ ] **Step 1: Write the page**

Create `app/history/submit/page.tsx`:

```tsx
'use client'

import { useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { submitStory } from './actions'
import { StoryEditor } from '@/components/stories/story-editor'
import { uploadPublicStoryImage, optimiseImage } from '@/lib/blob-client'
import { PageHeader } from '@/components/page-header'
import { Field, TextInput, FileInput } from '@/components/admin/fields'
import { Button } from '@/components/ui/button'

export default function SubmitStoryPage() {
  const params = useSearchParams()
  const submitted = params.get('submitted') === '1'
  const [coverUrl, setCoverUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const prepared = await optimiseImage(file, { maxEdge: 1600 })
    setCoverUrl(await uploadPublicStoryImage(prepared))
  }

  async function onSubmit(formData: FormData) {
    setBusy(true)
    setError(null)
    formData.set('coverImageUrl', coverUrl)
    try {
      await submitStory(formData)
    } catch (err) {
      // next/navigation's redirect() throws on success too — only treat a
      // real Error (our own validation) as a failure to show.
      if (err instanceof Error && !('digest' in err)) {
        setError(err.message)
        setBusy(false)
      }
    }
  }

  if (submitted) {
    return (
      <main>
        <PageHeader
          eyebrow="Your story"
          title="Thanks for sharing"
          intro="A committee member will review your story before it goes live on the history page."
        />
      </main>
    )
  }

  return (
    <main>
      <PageHeader
        eyebrow="Your story"
        title="Share your story"
        intro="Old photos, scorebooks, match reports, memories from the clubrooms — tell us your Lang Lang story. A committee member reviews every submission before it appears on the site."
      />
      <section className="container-site py-16 lg:py-20">
        <form action={onSubmit} className="mx-auto flex max-w-2xl flex-col gap-5">
          <Field label="Your name" htmlFor="submit-name">
            <TextInput id="submit-name" name="authorName" required />
          </Field>
          <Field label="Email" htmlFor="submit-email" hint="Optional — only so we can follow up if needed.">
            <TextInput id="submit-email" name="authorEmail" type="email" />
          </Field>
          <Field label="Title" htmlFor="submit-title">
            <TextInput id="submit-title" name="title" required />
          </Field>
          <Field label="Cover image" htmlFor="submit-cover" hint="Optional.">
            <FileInput id="submit-cover" accept="image/*" onChange={onCoverChange} />
          </Field>
          <Field label="Your story" htmlFor="submit-body">
            <StoryEditor name="contentJson" uploadImage={uploadPublicStoryImage} />
          </Field>

          {/* Honeypot: hidden from real visitors via CSS, not `type="hidden"`, so form-filling bots that target visible inputs still fill it. */}
          <div aria-hidden className="absolute -left-[9999px]" tabIndex={-1}>
            <label htmlFor="submit-website">Website</label>
            <input id="submit-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <div>
            <Button type="submit" size="xl" variant="brand" disabled={busy}>
              {busy ? 'Submitting…' : 'Submit for review'}
            </Button>
          </div>
        </form>
      </section>
    </main>
  )
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/history/submit/page.tsx
git commit -m "feat: add public story submission page"
```

---

## Task 13: Public history list + story detail page

**Files:**
- Modify: `app/history/page.tsx` (append stories list + submit CTA)
- Create: `app/history/[slug]/page.tsx`

**Interfaces:**
- Consumes: `listPublishedStories`, `getPublishedStoryBySlug` (Task 5), `PageHeader` (existing).

- [ ] **Step 1: Update the history page**

Modify `app/history/page.tsx` — add the import at the top:

```ts
import { listPublishedStories } from '@/lib/stories-queries'
```

Change the component to `async` and fetch stories, and replace the existing dashed "Got old photos, scorebooks or stories?" block (currently the last `<div>` before the closing `</div></section></main>`) to add a second CTA and append a stories section. The full updated file:

```tsx
import Image from 'next/image'
import Link from 'next/link'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { PageHeader } from '@/components/page-header'
import { listPublishedStories } from '@/lib/stories-queries'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'History | Lang Lang Cricket Club',
}

export default async function HistoryPage() {
  const stories = await listPublishedStories()

  return (
    <main>
      <PageHeader
        eyebrow="Our history"
        title="Where the club comes from"
        intro="A community cricket club is the sum of the people who have pulled on the colours over the years. Here is how we are piecing that story back together."
      />

      <section className="container-site grid gap-12 py-16 lg:grid-cols-[1fr_1.2fr] lg:items-start lg:gap-20 lg:py-24">
        <div className="relative overflow-hidden rounded-3xl bg-brand-stone shadow-card ring-1 ring-brand-black/5 lg:sticky lg:top-28">
          <Image
            src="/assets/gallery/photo-01.jpg"
            alt="Lang Lang Cricket Club players on the field at Caldermeade"
            width={1400}
            height={934}
            className="aspect-[3/2] h-full w-full object-cover"
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-brand-black/80 to-transparent p-6 text-white">
            <p className="eyebrow text-brand-gold">Caldermeade, Victoria</p>
            <p className="display mt-1 text-2xl">Lang Lang Cricket Club</p>
          </div>
        </div>

        <div>
          <blockquote className="font-heading border-l-4 border-brand-gold pl-6 text-3xl font-semibold leading-tight text-brand-black sm:text-4xl lg:text-5xl">
            You cannot make history without knowing where you started.
          </blockquote>

          <div className="mt-10 space-y-5 leading-relaxed text-brand-charcoal">
            <p>
              Much of the club&apos;s written record had faded or gone missing over the decades. In the
              2022&ndash;23 season that changed: through the work of the Club Committee, the
              club&apos;s history records were restored and brought back into the clubrooms.
            </p>
            <p>
              Those records now sit alongside a modern home ground in Caldermeade, developed with the
              support of Cardinia Shire Council and Community Bank Lang Lang, giving the next
              generation of juniors and seniors a place to add their own chapter.
            </p>
          </div>

          <div className="mt-10 rounded-2xl bg-brand-gold-pale p-6 ring-1 ring-brand-gold/30">
            <p className="eyebrow">With thanks</p>
            <p className="display mt-2 text-2xl text-brand-black">
              The Club Committee
            </p>
            <p className="mt-2 text-sm text-brand-charcoal">
              For restoring the club&apos;s history records in 2022&ndash;23.
            </p>
          </div>

          <div className="mt-6 rounded-2xl border border-dashed border-brand-black/20 p-6 transition hover:border-brand-gold">
            <p className="font-semibold text-brand-black">Got old photos, scorebooks or stories?</p>
            <p className="mt-1 text-sm text-brand-grey">
              We are always keen to add to the archive. Share your story below, or get in touch with the
              committee directly.
            </p>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
              <Link
                href="/history/submit"
                className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-semibold text-brand-black underline decoration-brand-gold decoration-2 underline-offset-4 transition hover:text-brand-gold-deep"
              >
                Share your story
                <HugeiconsIcon icon={ArrowRight01Icon} className="h-4 w-4" aria-hidden />
              </Link>
              <Link
                href="/contact"
                className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-semibold text-brand-black underline decoration-brand-gold decoration-2 underline-offset-4 transition hover:text-brand-gold-deep"
              >
                Contact the club
                <HugeiconsIcon icon={ArrowRight01Icon} className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {stories.length > 0 && (
        <section className="container-site py-16 lg:py-20">
          <div className="mb-8 flex items-center gap-3">
            <span className="display text-2xl text-brand-black">Stories</span>
            <span className="h-px flex-1 bg-brand-black/10" aria-hidden />
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {stories.map((story) => (
              <Link
                key={story.id}
                href={`/history/${story.slug}`}
                className="group flex flex-col overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-brand-black/5 transition hover:shadow-card-hover"
              >
                {story.coverImageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={story.coverImageUrl}
                    alt=""
                    className="aspect-video w-full object-cover transition group-hover:scale-[1.02]"
                  />
                )}
                <div className="flex flex-1 flex-col gap-2 p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand-gold-deep">
                    {story.publishedAt?.toLocaleDateString()}
                  </p>
                  <h3 className="font-heading text-lg font-bold text-brand-black">{story.title}</h3>
                  <p className="line-clamp-3 text-sm text-brand-grey">{story.excerpt}</p>
                  <p className="mt-auto text-xs text-brand-grey-light">By {story.authorName}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  )
}
```

- [ ] **Step 2: Write the story detail page**

Create `app/history/[slug]/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { getPublishedStoryBySlug } from '@/lib/stories-queries'
import { PageHeader } from '@/components/page-header'

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const story = await getPublishedStoryBySlug(params.slug)
  return { title: story ? `${story.title} | Lang Lang Cricket Club` : 'Story not found' }
}

export default async function StoryDetailPage({ params }: { params: { slug: string } }) {
  const story = await getPublishedStoryBySlug(params.slug)
  if (!story) notFound()

  return (
    <main>
      <PageHeader
        eyebrow="Our history"
        title={story.title}
        intro={`By ${story.authorName} · ${story.publishedAt?.toLocaleDateString() ?? ''}`}
      />
      <section className="container-site py-16 lg:py-20">
        <div className="mx-auto max-w-2xl">
          {story.coverImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={story.coverImageUrl} alt="" className="mb-8 aspect-video w-full rounded-2xl object-cover" />
          )}
          {/* eslint-disable-next-line react/no-danger -- content only ever comes from this app's own Tiptap editor, see lib/stories-content.ts */}
          <div className="story-content" dangerouslySetInnerHTML={{ __html: story.contentHtml }} />
        </div>
      </section>
    </main>
  )
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/history/page.tsx "app/history/[slug]"
git commit -m "feat: render published stories on /history and add story detail page"
```

---

## Task 14: Full test suite, build, and manual smoke test

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite once**

Run: `pnpm vitest run`
Expected: all tests pass, including every test added in Tasks 2, 3, 5, 8, 11 plus the pre-existing `auth.test.ts` and `crud.test.ts`.

- [ ] **Step 2: Production build**

Run: `pnpm build`
Expected: builds cleanly with no type or lint errors.

- [ ] **Step 3: Manual smoke test**

Run: `pnpm dev`, then in a browser:

1. Log into `/admin/login`, go to `/admin/stories`, click "New story", fill in a title and a short body with a heading, bold text, a bullet list and one inline image, click Publish. Confirm it appears under "Published" and immediately on `/history`.
2. Click "Edit" on that story, change the title, save, confirm the change shows on `/history/<slug>`.
3. Visit `/history/submit` (logged out / in an incognito window), submit a story with a title, your name, and a short body including one inline image. Confirm you land on the "Thanks for sharing" screen and the story does **not** yet appear on `/history`.
4. Back in `/admin/stories`, confirm the submission shows under "Pending review" with a rendered preview, click Approve, confirm it now appears on `/history` and at its own `/history/<slug>` URL.
5. Submit a second story at `/history/submit`, this time click Reject in the admin queue, and confirm `/history/<rejected-slug>` 404s.
6. Try submitting the form at `/history/submit` with the title/body left empty — confirm you get an inline error, not a server crash.

- [ ] **Step 4: Final commit (if the smoke test surfaced fixes)**

If any of the manual steps above required a code fix, commit it now with a message describing what was wrong. If nothing needed fixing, this step is a no-op.
