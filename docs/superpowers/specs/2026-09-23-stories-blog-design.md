# Stories / blog feature — design spec

Date: 2026-09-23

## Purpose

`/history` currently ends with a static "Got old photos or stories? Contact
the club" callout. Replace that dead end with a real publishing flow:

- Admin can write and publish stories (club history, match reports, anything)
  with a rich, Medium-like editor, including inline images.
- Any visitor can submit their own story, with the same rich editor and
  inline images, with no login required.
- Public submissions are held as **pending** until an admin approves them;
  approved submissions become normal published stories. Admin-authored
  stories publish immediately (no self-review step).

Success = a working editor at `/admin/(shell)/stories`, a public submission
form at `/history/submit`, an admin review queue, and published stories
rendering under `/history` and `/history/[slug]`.

## Out of scope

- Visitor accounts / login for submitters.
- Comments, likes, or any reader interaction on stories.
- Email notifications to submitters about approval/rejection.
- CAPTCHA (no captcha library exists in this project yet). Spam defense is a
  honeypot field only — acceptable for a small community club site; flagged
  here as a known trade-off, not a blocker.

## Data model

New table in `db/schema.ts`, following the existing style (serial id, plain
`pgTable`, no relations layer):

```ts
export const stories = pgTable('stories', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  excerpt: text('excerpt').notNull().default(''),
  contentJson: jsonb('content_json').notNull(), // Tiptap/ProseMirror document
  contentHtml: text('content_html').notNull(), // rendered server-side on save
  coverImageUrl: text('cover_image_url').notNull().default(''),
  authorName: text('author_name').notNull(),
  authorEmail: text('author_email').notNull().default(''),
  submittedByAdmin: boolean('submitted_by_admin').notNull().default(false),
  status: text('status').notNull().default('pending'), // 'pending' | 'published' | 'rejected'
  createdAt: timestamp('created_at').defaultNow().notNull(),
  publishedAt: timestamp('published_at'),
  reviewedAt: timestamp('reviewed_at'),
})
```

- `slug` generated from `title` (kebab-case) at submit time; on collision,
  append `-2`, `-3`, etc.
- `contentJson` is the source of truth (re-editable). `contentHtml` is a
  cached render (via Tiptap's `generateHTML`) so public pages need no
  client-side JS to display a post and so the list/detail pages stay fast.
- `rejected` rows are kept (not deleted) so admin has a record; they never
  render publicly.

## Editor

**Tiptap** (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-image`,
`@tiptap/extension-link`) used identically in both places it appears:

- Admin "new/edit story" page (`/admin/(shell)/stories/[id]` or a `new` route).
- Public submission page (`/history/submit`).

Both get the same toolbar: headings, bold/italic, bullet/numbered list,
blockquote, link, and **inline image** (click toolbar button → file picker →
uploads to Blob → inserts into the doc at the cursor). This matches the
"like Medium" ask — no separate feature split between admin and public
editors.

A single shared client component, `components/stories/story-editor.tsx`,
wraps Tiptap and exposes `{ json, html }` to its parent form on submit (via a
hidden `<input type="hidden">` populated on change, consistent with the
project's server-action-based forms — no client-side fetch to a JSON API).

## Image uploads

Two upload routes, both under `stories/` in Blob, both image-only,
`addRandomSuffix: true`:

1. **`/api/admin/upload`** (existing route) — add `'stories/'` to
   `ALLOWED_PREFIXES`. Used by the admin editor (already behind the admin
   session cookie check).
2. **`/api/stories/upload`** (new) — same `handleUpload` pattern, **no auth
   check** (public submitters aren't logged in), but:
   - `allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp']` only.
   - `maximumSizeInBytes: 8 * 1024 * 1024`.
   - fixed pathname prefix `stories/pending/` (server-enforced, ignores any
     client-supplied prefix) so pending-submission images are trivially
     distinguishable from admin-authored ones if cleanup is ever needed.

Images are resized client-side first via the existing `optimiseImage()`
helper in `lib/blob-client.ts` (already used by the gallery uploader),
reused as-is.

## Public submission flow (`/history/submit`)

Plain form (no login): name, email (optional), title, cover image
(optional, single file), body (Tiptap). Plus a hidden honeypot text input
(`website`) — real users never fill it in; if it arrives non-empty the
server action silently no-ops with a success message (don't tip off bots).

On submit (server action `submitStory`):
1. Validate required fields (name, title, non-empty body).
2. Generate slug, render `contentHtml` from `contentJson` server-side.
3. Insert row with `status: 'pending'`, `submittedByAdmin: false`.
4. Redirect to a "Thanks — a committee member will review your story"
   confirmation page/state.

## Admin review (`/admin/(shell)/stories`)

Follows the existing admin section pattern (`page.tsx` + `actions.ts`,
`AdminPageHeader`, `AdminCard`, `ActionForm`/`ConfirmDelete`-style server
actions):

- **Pending** section: cards showing title, author name/email, submitted
  date, a preview (rendered `contentHtml` in a scrollable box), with
  **Approve** and **Reject** buttons (server actions that flip `status` and
  set `reviewedAt`; approve also sets `publishedAt: now()`).
- **Published** section: existing stories list, each with **Edit** (opens
  the same Tiptap editor pre-filled, via a dedicated edit route rather than
  a dialog since the editor needs real vertical space) and **Unpublish**
  (sets status back to `rejected` — simplest state machine, no separate
  "draft" status needed since admin edits go live immediately on save,
  consistent with how every other admin section in this app already works).
- **New story** button → admin editor in create mode → saves with
  `status: 'published'`, `submittedByAdmin: true`, `publishedAt: now()`
  immediately.

## Public rendering

- `app/history/page.tsx`: keep all existing content; append a "Stories"
  section listing published stories (title, excerpt, cover image thumbnail,
  date), newest first, linking to `/history/[slug]`. Replace the current
  static "Got old photos or stories?" callout's contact-only CTA with a
  second button linking to `/history/submit` (keep the existing "Contact
  the club" link too — some people will still prefer that).
- `app/history/[slug]/page.tsx`: renders `contentHtml` (via
  `dangerouslySetInnerHTML`, safe here since content only ever comes from
  this app's own Tiptap editor / server-side sanitized render — no raw
  user HTML is ever stored or accepted), cover image, author name, date.
  404s (`notFound()`) if the slug doesn't exist or status isn't
  `published`.
- `app/history/submit/page.tsx`: the submission form described above.

## Testing

Following the existing Vitest setup (`tests/auth.test.ts` pattern):
- Slug generation (uniqueness/collision suffixing).
- `submitStory` server action: honeypot short-circuits, required-field
  validation, resulting row has `status: 'pending'`.
- `approveStory`/`rejectStory`: status transitions, `publishedAt` set only
  on approve, and that these actions check the admin session (mirroring the
  existing pattern in other admin actions).
- Public detail page: 404 on missing slug and on non-published status.

## Open trade-offs (accepted, not blocking)

- No CAPTCHA — honeypot only.
- No email notification to submitters on approve/reject — admin follows up
  manually if needed (matches "Contact the club" already being the
  low-tech norm here).
- No image cleanup job for rejected submissions' orphaned Blob files —
  acceptable at this site's scale; can be added later if storage becomes a
  concern.
