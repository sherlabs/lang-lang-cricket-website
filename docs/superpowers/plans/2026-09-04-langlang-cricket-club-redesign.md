# Lang Lang Cricket Club Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild langlangcricketclub.com as a modern Next.js site with all current assets self-hosted, plus a password-protected admin panel for CRUD on documents, gallery, sponsors, contacts, and fixtures.

**Architecture:** Next.js 14 App Router + TypeScript + Tailwind + shadcn/ui, deployed on Vercel free tier. Neon Postgres (Drizzle ORM) for content, Vercel Blob for admin-uploaded files. Public pages are Server Components reading Postgres directly; admin panel uses Server Actions built on one shared generic CRUD helper reused across all five resource types (documents, gallery photos, sponsors, contacts, fixtures) so the pattern is implemented once, not five times.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, shadcn/ui, Drizzle ORM, Neon Postgres (`@neondatabase/serverless`), `@vercel/blob`, `jose` (JWT session cookies), `bcryptjs`, Vitest for tests.

**Spec:** `docs/superpowers/specs/2026-09-04-langlang-cricket-club-redesign-design.md`

## Global Constraints

- Zero-cost hosting: Neon free tier, Vercel Blob free tier, Vercel free tier — no paid tier of anything.
- Single shared admin password (bcrypt hash in `ADMIN_PASSWORD_HASH` env var), no multi-user roles.
- All committed assets live under `/assets` (already downloaded: `assets/branding`, `assets/gallery`, `assets/sponsors`, `assets/documents`) and are only the seed/fallback — admin uploads go to Vercel Blob.
- `lib/playhq.ts` is written as a typed stub matching the documented `POST https://api.playhq.com/auth` (`clientId`/`clientSecret` → `access_token`/`exp`) call, but is not wired into any page — fixtures are manual admin data for now.
- No test coverage required for `lib/playhq.ts` since nothing calls it yet.
- Committee/club facts to use verbatim: President Eddie Duiker (0423 465 992), Treasurer Karen Duiker (0423 201 257), Secretary / Child Safety Officer & Junior Coordinator Erin Jozwin (0421 991 436), Head Club Coach Damien Quinlan (0430 166 172), club email langlangcricketclub@gmail.com, location Caldermeade, Victoria.

---

## File Structure

```
package.json, tsconfig.json, next.config.mjs, tailwind.config.ts, drizzle.config.ts, .env.local (gitignored), .env.example
db/
  schema.ts            # Drizzle table defs
  index.ts             # db client (Neon)
lib/
  auth.ts              # session cookie sign/verify, password check
  blob.ts              # upload helper wrapping @vercel/blob
  crud.ts              # generic makeCrudActions() factory used by every admin resource
  playhq.ts            # stub client, unused by pages
middleware.ts          # guards /admin/*
scripts/
  seed.ts              # inserts DB rows pointing at /assets files
components/
  site-nav.tsx
  site-footer.tsx
  photo-grid.tsx
  sponsor-tier.tsx
  document-list.tsx
  contact-card.tsx
  admin/
    admin-nav.tsx
    resource-table.tsx   # generic table+form UI driven by a column config
app/
  layout.tsx
  page.tsx                       # home
  history/page.tsx
  documents/page.tsx
  gallery/page.tsx
  sponsors/page.tsx
  fixtures/page.tsx
  contact/page.tsx
  admin/
    layout.tsx
    login/page.tsx
    login/actions.ts
    page.tsx                     # dashboard, links to sections
    documents/page.tsx
    documents/actions.ts
    gallery/page.tsx
    gallery/actions.ts
    sponsors/page.tsx
    sponsors/actions.ts
    contacts/page.tsx
    contacts/actions.ts
    fixtures/page.tsx
    fixtures/actions.ts
tests/
  auth.test.ts
  crud.test.ts
```

---

### Task 1: Project scaffold, Tailwind/shadcn, Drizzle schema, Neon connection

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `tailwind.config.ts`, `postcss.config.js`, `app/globals.css`, `app/layout.tsx`
- Create: `drizzle.config.ts`, `db/schema.ts`, `db/index.ts`
- Create: `.env.example`, `.gitignore`

**Interfaces:**
- Produces: `db` (Drizzle client, from `db/index.ts`, `import { db } from '@/db'`), and tables `documents`, `galleryPhotos`, `sponsors`, `committeeContacts`, `fixtures` from `db/schema.ts`, each with `id: serial primary key`, `createdAt: timestamp default now()`.

- [ ] **Step 1: Scaffold Next.js app**

```bash
npx --yes create-next-app@14 . --typescript --tailwind --app --eslint --src-dir=false --import-alias "@/*" --use-npm --no-turbopack
```
Answer prompts as needed (accept defaults). This creates `package.json`, `tsconfig.json`, `tailwind.config.ts`, `app/layout.tsx`, `app/globals.css`.

- [ ] **Step 2: Install remaining dependencies**

```bash
npm install drizzle-orm @neondatabase/serverless @vercel/blob jose bcryptjs
npm install -D drizzle-kit vitest @types/bcryptjs
npx --yes shadcn@latest init -d
npx --yes shadcn@latest add button input label table card dialog textarea
```

- [ ] **Step 3: Write `db/schema.ts`**

```typescript
import { pgTable, serial, text, timestamp, integer, boolean } from 'drizzle-orm/pg-core'

export const documents = pgTable('documents', {
  id: serial('id').primaryKey(),
  category: text('category').notNull(), // 'Codes of Conduct' | 'Policies' | 'Child Safety' | 'Game Day' | 'CCCA Directory'
  title: text('title').notNull(),
  url: text('url').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const galleryPhotos = pgTable('gallery_photos', {
  id: serial('id').primaryKey(),
  url: text('url').notNull(),
  caption: text('caption').notNull().default(''),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const sponsors = pgTable('sponsors', {
  id: serial('id').primaryKey(),
  tier: text('tier').notNull(), // 'Platinum' | 'Gold' | 'Silver' | 'Bronze'
  name: text('name').notNull(),
  logoUrl: text('logo_url').notNull(),
  linkUrl: text('link_url').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const committeeContacts = pgTable('committee_contacts', {
  id: serial('id').primaryKey(),
  role: text('role').notNull(),
  name: text('name').notNull(),
  phone: text('phone').notNull().default(''),
  email: text('email').notNull().default(''),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const fixtures = pgTable('fixtures', {
  id: serial('id').primaryKey(),
  team: text('team').notNull(),
  opponent: text('opponent').notNull(),
  venue: text('venue').notNull().default(''),
  matchDate: timestamp('match_date').notNull(),
  isResult: boolean('is_result').notNull().default(false),
  resultSummary: text('result_summary').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
```

- [ ] **Step 4: Write `db/index.ts`**

```typescript
import { drizzle } from 'drizzle-orm/neon-http'
import { neon } from '@neondatabase/serverless'
import * as schema from './schema'

const sql = neon(process.env.DATABASE_URL!)
export const db = drizzle(sql, { schema })
```

- [ ] **Step 5: Write `drizzle.config.ts`**

```typescript
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
})
```

- [ ] **Step 6: Write `.env.example`**

```
DATABASE_URL=
BLOB_READ_WRITE_TOKEN=
AUTH_SECRET=
ADMIN_PASSWORD_HASH=
PLAYHQ_ORG_ID=484ced51-403a-466c-9a94-bd95eedf7319
PLAYHQ_CLIENT_ID=
PLAYHQ_CLIENT_SECRET=
```

Copy to `.env.local` and confirm `.env.local` is in `.gitignore` (create-next-app adds this by default — verify).

- [ ] **Step 7: Verify it builds**

Run: `npm run build`
Expected: build succeeds (DB isn't queried at build time yet, so a missing `DATABASE_URL` is fine here as long as no page imports `db` yet).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
Scaffold Next.js app with Drizzle schema and Neon client

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011cvXzxw96Hy2NHv13ccaQg
EOF
)"
```

---

### Task 2: Auth (login, session cookie, middleware) with tests

**Files:**
- Create: `lib/auth.ts`
- Create: `middleware.ts`
- Create: `app/admin/login/page.tsx`, `app/admin/login/actions.ts`
- Create: `tests/auth.test.ts`

**Interfaces:**
- Consumes: `process.env.AUTH_SECRET`, `process.env.ADMIN_PASSWORD_HASH`
- Produces: `createSessionCookie(): Promise<string>`, `verifySessionCookie(token: string): Promise<boolean>`, `checkPassword(password: string): Promise<boolean>` — all exported from `lib/auth.ts`, used by `middleware.ts` and every later admin action/page that needs to confirm the caller is authenticated.

- [ ] **Step 1: Write failing test for password check and cookie round-trip**

```typescript
// tests/auth.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/auth.test.ts`
Expected: FAIL — `lib/auth` does not exist yet.

- [ ] **Step 3: Write `lib/auth.ts`**

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/auth.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Write `middleware.ts`**

```typescript
import { NextResponse, type NextRequest } from 'next/server'
import { COOKIE_NAME, verifySessionCookie } from '@/lib/auth'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (pathname === '/admin/login') return NextResponse.next()

  const token = request.cookies.get(COOKIE_NAME)?.value
  if (!token || !(await verifySessionCookie(token))) {
    return NextResponse.redirect(new URL('/admin/login', request.url))
  }
  return NextResponse.next()
}

export const config = { matcher: ['/admin/:path*'] }
```

- [ ] **Step 6: Write `app/admin/login/actions.ts`**

```typescript
'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { checkPassword, createSessionCookie, COOKIE_NAME } from '@/lib/auth'

export async function login(_prevState: { error: string } | undefined, formData: FormData) {
  const password = String(formData.get('password') ?? '')
  if (!(await checkPassword(password))) {
    return { error: 'Incorrect password.' }
  }
  const token = await createSessionCookie()
  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  })
  redirect('/admin')
}
```

- [ ] **Step 7: Write `app/admin/login/page.tsx`**

```tsx
'use client'

import { useFormState } from 'react-dom'
import { login } from './actions'

export default function LoginPage() {
  const [state, formAction] = useFormState(login, undefined)
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">Admin login</h1>
      <form action={formAction} className="flex flex-col gap-3">
        <input
          type="password"
          name="password"
          placeholder="Password"
          required
          className="rounded border px-3 py-2"
        />
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button type="submit" className="rounded bg-emerald-700 px-4 py-2 text-white">
          Log in
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 8: Manually verify middleware redirect**

Run `npm run dev`, visit `http://localhost:3000/admin` in a browser with no cookie set — confirm redirect to `/admin/login`. Log in with a password matching a locally-generated `ADMIN_PASSWORD_HASH` (generate one with `node -e "console.log(require('bcryptjs').hashSync('test-password', 10))"` and put it in `.env.local`) — confirm redirect to `/admin` succeeds.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
Add password-based admin auth with signed session cookie

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011cvXzxw96Hy2NHv13ccaQg
EOF
)"
```

---

### Task 3: Generic CRUD action factory + Blob upload helper, with tests

**Files:**
- Create: `lib/blob.ts`
- Create: `lib/crud.ts`
- Create: `tests/crud.test.ts`

**Interfaces:**
- Consumes: `db` from `db/index.ts`, any Drizzle `PgTable` with an `id` column.
- Produces: `uploadFile(file: File, pathPrefix: string): Promise<string>` from `lib/blob.ts`. `makeCrudActions<T>(table, opts)` from `lib/crud.ts`, returning `{ list, create, update, remove }` — `list(): Promise<T[]>`, `create(data): Promise<void>`, `update(id: number, data): Promise<void>`, `remove(id: number): Promise<void>`. Every admin resource (Task 4) is built by calling `makeCrudActions` once per table.

- [ ] **Step 1: Write failing test for `makeCrudActions` against an in-memory fake table**

```typescript
// tests/crud.test.ts
import { describe, it, expect, vi } from 'vitest'

describe('lib/crud makeCrudActions', () => {
  it('create/list/update/remove round-trip through the provided db handle', async () => {
    const rows: Array<{ id: number; name: string }> = []
    let nextId = 1
    const fakeDb = {
      select: () => ({ from: () => rows }),
      insert: () => ({
        values: (v: { name: string }) => {
          rows.push({ id: nextId++, name: v.name })
          return Promise.resolve()
        },
      }),
      update: () => ({
        set: (v: { name: string }) => ({
          where: () => {
            const row = rows.find((r) => r.id === 1)
            if (row) row.name = v.name
            return Promise.resolve()
          },
        }),
      }),
      delete: () => ({
        where: () => {
          const idx = rows.findIndex((r) => r.id === 1)
          if (idx >= 0) rows.splice(idx, 1)
          return Promise.resolve()
        },
      }),
    }

    const { makeCrudActions } = await import('@/lib/crud')
    const actions = makeCrudActions(fakeDb as never, {} as never, () => {})

    await actions.create({ name: 'Alpha' })
    expect(await actions.list()).toEqual([{ id: 1, name: 'Alpha' }])

    await actions.update(1, { name: 'Beta' })
    expect((await actions.list())[0].name).toBe('Beta')

    await actions.remove(1)
    expect(await actions.list()).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/crud.test.ts`
Expected: FAIL — `lib/crud` does not exist.

- [ ] **Step 3: Write `lib/blob.ts`**

```typescript
import { put } from '@vercel/blob'

export async function uploadFile(file: File, pathPrefix: string): Promise<string> {
  const blob = await put(`${pathPrefix}/${Date.now()}-${file.name}`, file, {
    access: 'public',
  })
  return blob.url
}
```

- [ ] **Step 4: Write `lib/crud.ts`**

```typescript
import { eq } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'

type AnyDb = {
  select: () => { from: (table: unknown) => Promise<unknown[]> | unknown[] }
  insert: (table: unknown) => { values: (v: object) => Promise<unknown> }
  update: (table: unknown) => { set: (v: object) => { where: (cond: unknown) => Promise<unknown> } }
  delete: (table: unknown) => { where: (cond: unknown) => Promise<unknown> }
}

export function makeCrudActions<Row extends { id: number }>(
  db: AnyDb,
  table: PgTable & { id: { name: string } },
  revalidate: () => void
) {
  return {
    async list(): Promise<Row[]> {
      return (await db.select().from(table)) as Row[]
    },
    async create(data: Omit<Row, 'id' | 'createdAt'>) {
      await db.insert(table).values(data as object)
      revalidate()
    },
    async update(id: number, data: Partial<Omit<Row, 'id' | 'createdAt'>>) {
      await db.update(table).set(data as object).where(eq(table as never, id))
      revalidate()
    },
    async remove(id: number) {
      await db.delete(table).where(eq(table as never, id))
      revalidate()
    },
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/crud.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
Add generic CRUD action factory and Blob upload helper

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011cvXzxw96Hy2NHv13ccaQg
EOF
)"
```

---

### Task 4: Admin panel — all five resources (documents, gallery, sponsors, contacts, fixtures)

**Files:**
- Create: `components/admin/admin-nav.tsx`, `components/admin/resource-table.tsx`
- Create: `app/admin/layout.tsx`, `app/admin/page.tsx`
- Create: `app/admin/documents/{page.tsx,actions.ts}`
- Create: `app/admin/gallery/{page.tsx,actions.ts}`
- Create: `app/admin/sponsors/{page.tsx,actions.ts}`
- Create: `app/admin/contacts/{page.tsx,actions.ts}`
- Create: `app/admin/fixtures/{page.tsx,actions.ts}`

**Interfaces:**
- Consumes: `makeCrudActions` and `uploadFile` from Task 3; `documents`, `galleryPhotos`, `sponsors`, `committeeContacts`, `fixtures` tables from Task 1.
- Produces: five working admin CRUD screens. Later tasks (public pages) read the same tables directly — no interface dependency on this task's code.

- [ ] **Step 1: Write `components/admin/admin-nav.tsx`**

```tsx
import Link from 'next/link'

const links = [
  { href: '/admin/documents', label: 'Documents' },
  { href: '/admin/gallery', label: 'Gallery' },
  { href: '/admin/sponsors', label: 'Sponsors' },
  { href: '/admin/contacts', label: 'Contacts' },
  { href: '/admin/fixtures', label: 'Fixtures' },
]

export function AdminNav() {
  return (
    <nav className="flex gap-4 border-b p-4">
      {links.map((l) => (
        <Link key={l.href} href={l.href} className="text-sm font-medium hover:underline">
          {l.label}
        </Link>
      ))}
    </nav>
  )
}
```

- [ ] **Step 2: Write `app/admin/layout.tsx`**

```tsx
import { AdminNav } from '@/components/admin/admin-nav'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <AdminNav />
      <div className="p-6">{children}</div>
    </div>
  )
}
```

- [ ] **Step 3: Write `app/admin/page.tsx`**

```tsx
import Link from 'next/link'

export default function AdminDashboard() {
  return (
    <main>
      <h1 className="mb-4 text-2xl font-semibold">Lang Lang CC — Admin</h1>
      <p className="text-sm text-gray-600">
        Manage <Link href="/admin/documents" className="underline">documents</Link>,{' '}
        <Link href="/admin/gallery" className="underline">gallery</Link>,{' '}
        <Link href="/admin/sponsors" className="underline">sponsors</Link>,{' '}
        <Link href="/admin/contacts" className="underline">contacts</Link>, and{' '}
        <Link href="/admin/fixtures" className="underline">fixtures</Link>.
      </p>
    </main>
  )
}
```

- [ ] **Step 4: Write `app/admin/documents/actions.ts`**

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/db'
import { documents } from '@/db/schema'
import { makeCrudActions } from '@/lib/crud'
import { uploadFile } from '@/lib/blob'

const actions = makeCrudActions<typeof documents.$inferSelect>(db as never, documents, () =>
  revalidatePath('/documents')
)

export const listDocuments = actions.list
export const removeDocument = actions.remove

export async function createDocument(formData: FormData) {
  const file = formData.get('file') as File
  const url = await uploadFile(file, 'documents')
  await actions.create({
    category: String(formData.get('category')),
    title: String(formData.get('title')),
    url,
  } as never)
}
```

- [ ] **Step 5: Write `app/admin/documents/page.tsx`**

```tsx
import { listDocuments, createDocument, removeDocument } from './actions'

export default async function DocumentsAdminPage() {
  const docs = await listDocuments()
  return (
    <main>
      <h1 className="mb-4 text-xl font-semibold">Documents</h1>
      <form action={createDocument} className="mb-6 flex flex-wrap gap-2">
        <select name="category" required className="rounded border px-2 py-1">
          <option>Codes of Conduct</option>
          <option>Policies</option>
          <option>Child Safety</option>
          <option>Game Day</option>
          <option>CCCA Directory</option>
        </select>
        <input name="title" placeholder="Title" required className="rounded border px-2 py-1" />
        <input type="file" name="file" accept="application/pdf" required />
        <button type="submit" className="rounded bg-emerald-700 px-3 py-1 text-white">
          Add
        </button>
      </form>
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            <th>Category</th>
            <th>Title</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {docs.map((d) => (
            <tr key={d.id} className="border-t">
              <td>{d.category}</td>
              <td>
                <a href={d.url} target="_blank" className="underline">
                  {d.title}
                </a>
              </td>
              <td>
                <form
                  action={async () => {
                    'use server'
                    await removeDocument(d.id)
                  }}
                >
                  <button type="submit" className="text-red-600">
                    Delete
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
```

- [ ] **Step 6: Repeat steps 4-5 for gallery, sponsors, contacts, fixtures**

Same shape, field sets from the schema in Task 1:

- `app/admin/gallery/actions.ts` / `page.tsx` — fields `url` (via `uploadFile(file, 'gallery')`), `caption`, `sortOrder`.
- `app/admin/sponsors/actions.ts` / `page.tsx` — fields `tier` (select: Platinum/Gold/Silver/Bronze), `name`, `logoUrl` (via `uploadFile(file, 'sponsors')`), `linkUrl`.
- `app/admin/contacts/actions.ts` / `page.tsx` — fields `role`, `name`, `phone`, `email`, `sortOrder`. No file upload.
- `app/admin/fixtures/actions.ts` / `page.tsx` — fields `team`, `opponent`, `venue`, `matchDate` (datetime-local input), `isResult` (checkbox), `resultSummary`. No file upload.

Follow the exact same `makeCrudActions` + form + table pattern as documents. Each `actions.ts` revalidates its own public path (`/gallery`, `/sponsors`, `/contact`, `/fixtures`).

- [ ] **Step 7: Manual verification**

Run `npm run dev`, log into `/admin`, and for each of the five sections: add one row, confirm it lists, delete it, confirm it's gone. Requires `DATABASE_URL` and `BLOB_READ_WRITE_TOKEN` to be set in `.env.local` (a Neon database and Vercel Blob store must exist by this point — create both via the Vercel dashboard / `vercel env pull` if not already done).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
Add admin CRUD screens for documents, gallery, sponsors, contacts, fixtures

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011cvXzxw96Hy2NHv13ccaQg
EOF
)"
```

---

### Task 5: Public site — layout, nav, footer, home page

**Files:**
- Create: `components/site-nav.tsx`, `components/site-footer.tsx`
- Modify: `app/layout.tsx`
- Create: `app/page.tsx`

**Interfaces:**
- Consumes: `db`, `sponsors`, `committeeContacts` tables.
- Produces: shared `<SiteNav>` / `<SiteFooter>` used by every public page task below.

- [ ] **Step 1: Write `components/site-nav.tsx`**

```tsx
import Link from 'next/link'
import Image from 'next/image'

const links = [
  { href: '/', label: 'Home' },
  { href: '/history', label: 'History' },
  { href: '/documents', label: 'Documents & Policies' },
  { href: '/gallery', label: 'Gallery' },
  { href: '/sponsors', label: 'Sponsors' },
  { href: '/fixtures', label: 'Fixtures' },
  { href: '/contact', label: 'Contact' },
]

export function SiteNav() {
  return (
    <header className="sticky top-0 z-10 border-b bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-bold">
          <Image src="/assets/branding/logo.png" alt="Lang Lang Cricket Club" width={40} height={50} />
          Lang Lang Cricket Club
        </Link>
        <nav className="hidden gap-5 text-sm font-medium md:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-emerald-700">
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  )
}
```

- [ ] **Step 2: Write `components/site-footer.tsx`**

```tsx
export function SiteFooter() {
  return (
    <footer className="mt-16 border-t bg-emerald-950 py-8 text-center text-sm text-emerald-100">
      <p>Lang Lang Cricket Club — Caldermeade, Victoria</p>
      <p>langlangcricketclub@gmail.com</p>
    </footer>
  )
}
```

- [ ] **Step 3: Modify `app/layout.tsx`** to wrap children with `<SiteNav>` / `<SiteFooter>` and set metadata title `"Lang Lang Cricket Club"`.

- [ ] **Step 4: Write `app/page.tsx`**

```tsx
import Image from 'next/image'
import { db } from '@/db'
import { sponsors, committeeContacts } from '@/db/schema'

export const revalidate = 3600

export default async function HomePage() {
  const [sponsorRows, contacts] = await Promise.all([
    db.select().from(sponsors),
    db.select().from(committeeContacts),
  ])

  return (
    <main>
      <section className="relative h-[420px] w-full">
        <Image
          src="/assets/branding/hero.jpg"
          alt="Lang Lang Cricket Club"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 flex items-center bg-black/40">
          <div className="mx-auto max-w-3xl px-4 text-white">
            <h1 className="text-4xl font-bold">Lang Lang Cricket Club</h1>
            <p className="mt-3 text-lg">
              A vibrant cricket community in Caldermeade, Victoria — for players of every age.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-12 leading-relaxed">
        <p>
          Lang Lang Cricket Club is a family-friendly club offering both junior and senior cricket,
          with a strong focus on developing talent and building community. Our state-of-the-art
          facility in Caldermeade is supported by Cardinia Shire and the local Bendigo Bank.
        </p>
      </section>

      <section className="bg-gray-50 py-12">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-6 px-4 md:grid-cols-4">
          {contacts.map((c) => (
            <div key={c.id} className="rounded-lg bg-white p-4 text-center shadow-sm">
              <p className="font-semibold">{c.role}</p>
              <p>{c.name}</p>
              {c.phone && <p className="text-sm text-gray-600">{c.phone}</p>}
            </div>
          ))}
        </div>
      </section>

      {sponsorRows.length > 0 && (
        <section className="mx-auto max-w-5xl px-4 py-12">
          <h2 className="mb-6 text-center text-xl font-semibold">Our Sponsors</h2>
          <div className="flex flex-wrap items-center justify-center gap-8">
            {sponsorRows.map((s) => (
              <img key={s.id} src={s.logoUrl} alt={s.name} className="h-16 object-contain" />
            ))}
          </div>
        </section>
      )}
    </main>
  )
}
```

- [ ] **Step 5: Manual check** — `npm run dev`, visit `/`, confirm hero renders, contact cards render once Task 6's seed has run.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
Build public site layout, nav, footer, and home page

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011cvXzxw96Hy2NHv13ccaQg
EOF
)"
```

---

### Task 6: Remaining public pages (history, documents, gallery, sponsors, fixtures, contact)

**Files:**
- Create: `app/history/page.tsx`
- Create: `app/documents/page.tsx`
- Create: `app/gallery/page.tsx`
- Create: `app/sponsors/page.tsx`
- Create: `app/fixtures/page.tsx`
- Create: `app/contact/page.tsx`

**Interfaces:**
- Consumes: `db`, `documents`, `galleryPhotos`, `sponsors`, `fixtures`, `committeeContacts` tables.

- [ ] **Step 1: Write `app/history/page.tsx`**

```tsx
export default function HistoryPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-6 text-3xl font-bold">Our History</h1>
      <blockquote className="border-l-4 border-emerald-700 pl-4 italic text-gray-700">
        "History cannot be made without understanding where we come from."
      </blockquote>
      <p className="mt-6">
        Our history was restored in 2022–23 thanks to the kind donation of Josephine Giacco and
        the Club Committee.
      </p>
    </main>
  )
}
```

- [ ] **Step 2: Write `app/documents/page.tsx`**

```tsx
import { db } from '@/db'
import { documents } from '@/db/schema'

export const revalidate = 3600

const CATEGORY_ORDER = ['Codes of Conduct', 'Policies', 'Child Safety', 'Game Day', 'CCCA Directory']

export default async function DocumentsPage() {
  const rows = await db.select().from(documents)
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-8 text-3xl font-bold">Documents & Policies</h1>
      {CATEGORY_ORDER.map((cat) => {
        const items = rows.filter((r) => r.category === cat)
        if (items.length === 0) return null
        return (
          <section key={cat} className="mb-8">
            <h2 className="mb-3 text-xl font-semibold">{cat}</h2>
            <ul className="list-disc space-y-1 pl-6">
              {items.map((d) => (
                <li key={d.id}>
                  <a href={d.url} target="_blank" className="text-emerald-700 underline">
                    {d.title}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </main>
  )
}
```

- [ ] **Step 3: Write `app/gallery/page.tsx`**

```tsx
import { db } from '@/db'
import { galleryPhotos } from '@/db/schema'
import { asc } from 'drizzle-orm'

export const revalidate = 3600

export default async function GalleryPage() {
  const photos = await db.select().from(galleryPhotos).orderBy(asc(galleryPhotos.sortOrder))
  return (
    <main className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="mb-8 text-3xl font-bold">Gallery</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {photos.map((p) => (
          <img
            key={p.id}
            src={p.url}
            alt={p.caption || 'Lang Lang Cricket Club'}
            className="aspect-square w-full rounded object-cover"
          />
        ))}
      </div>
    </main>
  )
}
```

- [ ] **Step 4: Write `app/sponsors/page.tsx`**

```tsx
import { db } from '@/db'
import { sponsors } from '@/db/schema'

export const revalidate = 3600

const TIERS = ['Platinum', 'Gold', 'Silver', 'Bronze']

export default async function SponsorsPage() {
  const rows = await db.select().from(sponsors)
  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="mb-8 text-3xl font-bold">Sponsors & Partners</h1>
      {TIERS.map((tier) => {
        const items = rows.filter((s) => s.tier === tier)
        if (items.length === 0) return null
        return (
          <section key={tier} className="mb-10">
            <h2 className="mb-4 text-xl font-semibold">{tier} Sponsors</h2>
            <div className="flex flex-wrap items-center gap-8">
              {items.map((s) =>
                s.linkUrl ? (
                  <a key={s.id} href={s.linkUrl} target="_blank">
                    <img src={s.logoUrl} alt={s.name} className="h-20 object-contain" />
                  </a>
                ) : (
                  <img key={s.id} src={s.logoUrl} alt={s.name} className="h-20 object-contain" />
                )
              )}
            </div>
          </section>
        )
      })}
    </main>
  )
}
```

- [ ] **Step 5: Write `app/fixtures/page.tsx`**

```tsx
import { db } from '@/db'
import { fixtures } from '@/db/schema'
import { asc } from 'drizzle-orm'

export const revalidate = 900

export default async function FixturesPage() {
  const rows = await db.select().from(fixtures).orderBy(asc(fixtures.matchDate))
  const upcoming = rows.filter((f) => !f.isResult)
  const results = rows.filter((f) => f.isResult)

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-2 text-3xl font-bold">Fixtures & Results</h1>
      <p className="mb-8 text-sm text-gray-600">
        Full ladder and draw:{' '}
        <a
          href="https://www.playhq.com/cricket-australia"
          target="_blank"
          className="underline"
        >
          view on PlayHQ
        </a>
      </p>

      <h2 className="mb-3 text-xl font-semibold">Upcoming</h2>
      <ul className="mb-10 divide-y">
        {upcoming.map((f) => (
          <li key={f.id} className="py-2">
            <span className="font-medium">{f.team}</span> vs {f.opponent} —{' '}
            {new Date(f.matchDate).toLocaleDateString('en-AU')} {f.venue && `@ ${f.venue}`}
          </li>
        ))}
        {upcoming.length === 0 && <li className="py-2 text-gray-500">No fixtures entered yet.</li>}
      </ul>

      <h2 className="mb-3 text-xl font-semibold">Recent Results</h2>
      <ul className="divide-y">
        {results.map((f) => (
          <li key={f.id} className="py-2">
            <span className="font-medium">{f.team}</span> vs {f.opponent} — {f.resultSummary}
          </li>
        ))}
        {results.length === 0 && <li className="py-2 text-gray-500">No results entered yet.</li>}
      </ul>
    </main>
  )
}
```

- [ ] **Step 6: Write `app/contact/page.tsx`**

```tsx
import { db } from '@/db'
import { committeeContacts } from '@/db/schema'
import { asc } from 'drizzle-orm'

export const revalidate = 3600

export default async function ContactPage() {
  const contacts = await db.select().from(committeeContacts).orderBy(asc(committeeContacts.sortOrder))
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-8 text-3xl font-bold">Contact</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {contacts.map((c) => (
          <div key={c.id} className="rounded-lg border p-4">
            <p className="font-semibold">{c.role}</p>
            <p>{c.name}</p>
            {c.phone && <p className="text-sm text-gray-600">Ph. {c.phone}</p>}
            {c.email && (
              <a href={`mailto:${c.email}`} className="text-sm text-emerald-700 underline">
                {c.email}
              </a>
            )}
          </div>
        ))}
      </div>
      <p className="mt-8 text-gray-700">
        Caldermeade, Victoria — follow us on Facebook for match schedules and updates.
      </p>
    </main>
  )
}
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
Add remaining public pages: history, documents, gallery, sponsors, fixtures, contact

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011cvXzxw96Hy2NHv13ccaQg
EOF
)"
```

---

### Task 7: Seed script, PlayHQ stub client, final verification

**Files:**
- Create: `scripts/seed.ts`
- Create: `lib/playhq.ts`
- Modify: `package.json` (add `"seed": "tsx scripts/seed.ts"` script; `npm install -D tsx`)

**Interfaces:**
- Consumes: `db`, all five tables.
- Produces: populated dev/prod database; `lib/playhq.ts` exports `getPlayHQAccessToken(): Promise<string>` (unused elsewhere, per Global Constraints).

- [ ] **Step 1: Write `lib/playhq.ts`**

```typescript
// Stub client for the PlayHQ External API (https://docs.playhq.com/tech).
// Not wired into any page yet — PLAYHQ_CLIENT_ID/SECRET are blank until
// PlayHQ grants data-partner access (requested via help@playhq.com).
// Swapping the fixtures page (app/fixtures/page.tsx) from manual DB data
// to this client is the only change needed once credentials exist.

export async function getPlayHQAccessToken(): Promise<string> {
  const res = await fetch('https://api.playhq.com/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: process.env.PLAYHQ_CLIENT_ID,
      clientSecret: process.env.PLAYHQ_CLIENT_SECRET,
    }),
  })
  if (!res.ok) throw new Error(`PlayHQ auth failed: ${res.status}`)
  const data = (await res.json()) as { access_token: string; exp: number }
  return data.access_token
}
```

- [ ] **Step 2: Write `scripts/seed.ts`**

```typescript
import { db } from '../db'
import { documents, galleryPhotos, sponsors, committeeContacts } from '../db/schema'

async function main() {
  await db.insert(documents).values([
    { category: 'Codes of Conduct', title: 'CCCA General Code of Conduct', url: '/assets/documents/ccca-general-code-of-conduct.pdf' },
    { category: 'Codes of Conduct', title: 'CCCA Junior Code of Conduct', url: '/assets/documents/ccca-junior-code-of-conduct.pdf' },
    { category: 'Codes of Conduct', title: 'CCCA Parent Code of Conduct', url: '/assets/documents/ccca-parent-code-of-conduct.pdf' },
    { category: 'Policies', title: 'CCCA Extreme Weather Policy', url: '/assets/documents/ccca-extreme-weather-policy.pdf' },
    { category: 'Policies', title: 'CCCA Social Media Policy', url: '/assets/documents/ccca-social-media-policy.pdf' },
    { category: 'Policies', title: 'CCCA WWCC Policy', url: '/assets/documents/ccca-wwcc-policy.pdf' },
    { category: 'Policies', title: 'CV Complaints & Resolution Policy 2024', url: '/assets/documents/cv-complaints-resolution-policy-2024.pdf' },
    { category: 'Policies', title: 'CV Smoke Pollution Guidelines', url: '/assets/documents/cv-smoke-pollution-guidelines.pdf' },
    { category: 'Policies', title: 'CV Suspect Bowling Actions Guidelines', url: '/assets/documents/cv-suspect-bowling-actions-guidelines.pdf' },
    { category: 'Child Safety', title: 'Betrayal of Trust Fact Sheet', url: '/assets/documents/betrayal-of-trust-fact-sheet.pdf' },
    { category: 'Child Safety', title: 'LLCC Conflict Resolution Policy', url: '/assets/documents/llcc-conflict-resolution-policy.pdf' },
    { category: 'Child Safety', title: "Australian Cricket's Policy for Safeguarding Children & Young People", url: '/assets/documents/safeguarding-children-policy.pdf' },
    { category: 'Child Safety', title: "Australian Cricket's Commitment to Safeguarding Children and Young People", url: '/assets/documents/safeguarding-commitment.pdf' },
    { category: 'Child Safety', title: 'Code of Behaviour for Affiliated Associations, Clubs and Indoor Centres', url: '/assets/documents/code-of-behaviour-affiliated-clubs.pdf' },
    { category: 'Game Day', title: 'Marsh Sport Cricket Game Day Training Checklist', url: '/assets/documents/game-day-training-checklist.pdf' },
    { category: 'CCCA Directory', title: 'CCCA Directory 25/26', url: '/assets/documents/ccca-directory-25-26.pdf' },
  ])

  const galleryFiles = Array.from({ length: 16 }, (_, i) => `photo-${String(i + 1).padStart(2, '0')}.jpg`)
  await db.insert(galleryPhotos).values(
    galleryFiles.map((f, i) => ({ url: `/assets/gallery/${f}`, caption: '', sortOrder: i }))
  )

  await db.insert(sponsors).values([
    { tier: 'Platinum', name: 'Platinum Sponsor', logoUrl: '/assets/sponsors/platinum-01.png', linkUrl: '' },
    { tier: 'Gold', name: 'Gold Sponsor 1', logoUrl: '/assets/sponsors/gold-01.png', linkUrl: '' },
    { tier: 'Gold', name: 'Gold Sponsor 2', logoUrl: '/assets/sponsors/gold-02.png', linkUrl: '' },
    { tier: 'Gold', name: 'Gold Sponsor 3', logoUrl: '/assets/sponsors/gold-03.png', linkUrl: '' },
    { tier: 'Gold', name: 'Gold Sponsor 4', logoUrl: '/assets/sponsors/gold-04.png', linkUrl: '' },
    { tier: 'Gold', name: 'Gold Sponsor 5', logoUrl: '/assets/sponsors/gold-05.png', linkUrl: '' },
    { tier: 'Gold', name: 'Gold Sponsor 6', logoUrl: '/assets/sponsors/gold-06.png', linkUrl: '' },
    { tier: 'Silver', name: 'Dan Quinn', logoUrl: '/assets/sponsors/silver-01.jpg', linkUrl: '' },
    { tier: 'Silver', name: 'Big Dogg', logoUrl: '/assets/sponsors/silver-02.png', linkUrl: '' },
    { tier: 'Silver', name: 'Lang Lang Fish and Chips', logoUrl: '/assets/sponsors/silver-03.jpg', linkUrl: '' },
    { tier: 'Silver', name: 'LLS', logoUrl: '/assets/sponsors/silver-04.jpg', linkUrl: '' },
  ])

  await db.insert(committeeContacts).values([
    { role: 'President', name: 'Eddie Duiker', phone: '0423 465 992', email: 'langlangcricketclub@gmail.com', sortOrder: 0 },
    { role: 'Treasurer', name: 'Karen Duiker', phone: '0423 201 257', email: 'langlangcricketclub@gmail.com', sortOrder: 1 },
    { role: 'Secretary / Child Safety Officer & Junior Coordinator', name: 'Erin Jozwin', phone: '0421 991 436', email: 'langlangcricketclub@gmail.com', sortOrder: 2 },
    { role: 'Head Club Coach', name: 'Damien Quinlan', phone: '0430 166 172', email: 'langlangcricketclub@gmail.com', sortOrder: 3 },
  ])

  console.log('Seed complete.')
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 2b: Add npm script**

In `package.json`, add to `"scripts"`: `"seed": "tsx scripts/seed.ts"`. Run `npm install -D tsx`.

- [ ] **Step 3: Run seed against dev database**

Ensure `DATABASE_URL` in `.env.local` points at a Neon database, then:

```bash
npx drizzle-kit push
npm run seed
```

Expected: "Seed complete." printed, no errors.

- [ ] **Step 4: Full manual verification pass**

Run `npm run build && npm run start`. Using claude-in-chrome, visit every public route (`/`, `/history`, `/documents`, `/gallery`, `/sponsors`, `/fixtures`, `/contact`) and confirm real content renders (photos, sponsor logos, documents, contacts). Log into `/admin`, add a test fixture, confirm it appears on `/fixtures`, then delete it.

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: all tests pass (auth + crud).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
Add seed script and PlayHQ stub client; verify full site end-to-end

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011cvXzxw96Hy2NHv13ccaQg
EOF
)"
```
