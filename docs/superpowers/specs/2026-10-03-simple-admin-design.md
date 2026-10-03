# Simple admin for the committee (design)

Branch `feat/simple-admin`. The `/admin` is used by volunteers who are not technical. Goal: add an
event, post an announcement, add photos, update sponsors and contacts, upload a document and approve
submitted stories and photos, with no training and no jargon.

## Roles

`users.role` already has `admin` and `editor`; no schema change, no migration. Everything below is
UI only. **Access rules (`payload/access`) are untouched**; `tests/int/admin-access.int.test.ts` pins
anonymous, editor and admin behaviour. One exception on the API side: `disableDuplicate: true` on the
editor-facing collections removes the Duplicate action (button and API).

- **editor** (committee): a flat menu of everyday items, a friendly Home, Help.
- **admin** (site owner): the same, plus an "Advanced" section and an "Advanced" block on Home.

## How it works

| Piece | File |
|---|---|
| Role helpers: `isAdminUser`, `hiddenFromEditors` (entity `admin.hidden`), `adminOnlyCondition` (field `admin.condition`) | `payload/admin/visibility.ts` |
| The whole menu, Home tiles, active-link logic | `payload/admin/navigation.ts` |
| Help page wording (edit this file to change the guide) | `payload/admin/helpContent.ts` |
| Plain-English overrides of Payload text (delete confirm, "Add new", validation), tab title | `payload/admin/copy.ts` |
| Sidebar (`beforeNavLinks`) | `components/AdminNav.tsx`, `NavLinks.tsx` |
| Home (`views.dashboard`) | `components/Dashboard.tsx` |
| Help, Waiting for approval (`views.help`, `views.approvals`) | `components/HelpView.tsx`, `ApprovalsView.tsx`, `ApprovalPhotos.tsx`, `AdminPage.tsx` |
| Theme | `components/admin.css` (light theme, brand tokens, bigger text and buttons) |

Payload's own grouped sidebar is switched off by giving every collection and global
`admin.group: false`; `AdminNav` draws one flat list instead. Direct URLs are still guarded: entities
that editors must not use have `admin.hidden: hiddenFromEditors`, so `/admin/collections/users` is a 404 for them.
`media` and `event-photos` are not hidden (they are upload targets for the forms and the event page)
but are not in the editor menu. Custom views call `requireUser` first, because Payload does not gate them.

## Editor menu

Home, Events, Announcements, Photo gallery, Sponsors, Committee & contacts, Documents, Club history stories,
Players, Waiting for approval (count badge), Help.

Hidden from editors: Users, Club details, Site settings, RSVPs, Player aliases, Player seasons, Sync runs
(hidden entirely); Media library and Event photos (not in the menu). RSVPs show on the event page
("Who is coming"); pending event photos show on the event page and under Waiting for approval; pending
stories show under Waiting for approval and as a banner on the stories list.

## Forms

Important fields first; plain labels, helper text and placeholders; system fields (slug, source, sync
flags, story timestamps and links, sort order of photos, `legacyUrl`, tokens) hidden from editors with
`adminOnlyCondition` (the stored value is untouched). Dinner and payment fields on events sit in a
closed "Dinner and tickets (optional)" section. List views show 2 to 4 columns and search the main
field. The API tab is hidden (`hideAPIURL`). Uploads happen on the form (Add new, or drag and drop).
No collection uses versions or drafts, so there was no autosave to keep.

## Adding a new collection

1. Set `admin.group: false`, `labels` (plain words), `admin.description`, `defaultColumns` (2 to 4), `listSearchableFields`.
2. Committee should use it: add one entry to `everydayNav` in `payload/admin/navigation.ts` (and a tile in `jobTiles` if it is a common job). Do not hide it.
3. Admin only: add one entry to `advancedNav` and set `admin.hidden: hiddenFromEditors` (use `adminOnlyCondition()` on technical fields).
4. `tests/admin-visibility.test.ts` fails until every collection is in the navigation file with `group: false`.
5. Run `pnpm generate` (the import map).

## Known limits

- Upload fields still offer both "Add new" and "Choose from existing" (Payload). New uploads are one step in a drawer.
- `Announcements.published` still defaults to off (changing the default would change API behaviour); the label and help text say so.
- Custom view tab titles come from `meta.title`; the default dashboard title is Payload's.
