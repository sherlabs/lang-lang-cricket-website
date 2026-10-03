# People identity, player sponsors and club apparel (design note)

Date: 2026-10-04. Branch: feat/payload-cms.

Three small features, one theme: each real-world thing (a person, a sponsor, the shop link)
is edited in exactly one place and every page reads it from there.

## 1. One source of truth for individuals

### Audit (what was found)

Searched `app/(frontend)/**`, `components/**`, `lib/**`, `payload/seed/**`, `payload/globals/Club.ts`,
club defaults and page copy, `lib/structured-data.ts`, the footer, history copy, yearbooks, honours
and the sitemap for any person's name, role, phone, email or photo.

| Place | Finding | Action |
| --- | --- | --- |
| Home committee strip, `/contact` (committee and leadership), `/people` | Already read the `people` collection (`listPeople` -> `toPerson` -> `CommitteeCards`). Not hard-coded. | Moved behind one query module (`lib/people-queries.ts`) and one shared `PersonCard` (`components/person-card.tsx`) that uses the shared `Avatar`. |
| `club` global and `payload/seed/club-defaults.ts` | No person is stored as text. `email` is the club mailbox, not a person; history callout and yearbook messages are club copy. Names appear only in `payload/scripts/seed-demo.ts` (demo rows written INTO `people`). | Nothing to migrate. Rule documented: a person is never typed into a global. |
| `lib/structured-data.ts` | No founder/contact persons. `playerJsonLd` takes a photo. | Player JSON-LD now receives the resolved photo. |
| Footer, sitemap | Club email and static paths only. | None. |
| Player photos (`/players` tiles, `/players/[slug]` hero, Open Graph image, JSON-LD) | A player has their own `photo`. A committee member who also plays had two unrelated photos to maintain. | Resolver below. |
| Initials fallback | Duplicated in `committee-cards.tsx` and `lib/players/view.ts`. | One `initials()` in `lib/identity.ts`, one `Avatar` component. |
| Story `authorName` | Free text typed by a visitor submitting a story, not a club role. | Left alone on purpose. |

### Identity rule

`people.player` is an optional relationship to `players`. For a player with a linked person:

- **Photo**: `player.photo`, else `person.photo`, else initials. Resolved by `resolvePhotoUrl()` in
  `lib/identity.ts`. To maintain the picture in ONE place, add it on the person (Committee & contacts)
  and leave the player's photo empty: it then appears on `/players`, the profile and share image.
  A player's own photo still wins if someone did set one (no surprise overrides).
- **Name**: never overridden. The player name is the PlayHQ stat identity (aliases, merge and sync
  depend on it). The person keeps their own committee name.
- **Reverse link**: the person card shows a "Player profile" link; the player page shows the club
  role ("President") linking to `/people`; the player admin form has a read-only "Also on the committee" join.
- Merging two players repoints `people.player`/`player-sponsors.player`; deleting a player clears the
  person link (the person stays) and deletes that player's sponsor rows.

`payload/scripts/link-people-players.ts` proposes links by exact normalised name (case, accent,
punctuation and whitespace folded). It reports matched, ambiguous and unmatched, never guesses, is
dry-run unless `--apply --confirm`, and uses the standard `--target` guard.

### Call sites migrated (checked by `tests/people-single-source.test.ts`)

- `app/(frontend)/page.tsx`, `contact/page.tsx`, `people/page.tsx`: `listPeople` from `@/lib/people-queries`, rendered with `PeopleGrid` -> `PersonCard`.
- `lib/content-queries.ts`: `listPeople` removed (no second implementation).
- `components/committee-cards.tsx`: deleted; replaced by `components/person-card.tsx`.
- `components/players/player-card.tsx`, `app/(frontend)/players/[slug]/page.tsx`: use `Avatar`.
- `lib/players/queries.ts` (`listPublicPlayers`, `getPlayerProfile`): apply the photo rule once, so tiles, hero, OG and JSON-LD agree.
- The grep test fails if any file under `app/`, `components/` imports `toPerson`, or defines its own initials helper, or renders a person photo with a raw `<img>` outside `components/avatar.tsx`.

## 2. Player sponsors

Collection `player-sponsors` (admin label "Player sponsors").

Fields: `player` (required, -> players), `sponsor` (required, -> sponsors), `season` (optional text),
`message` (optional, 280 chars), `featured` (checkbox), `sortOrder`, `active` (default on).

**Reuse `sponsors` rather than inline name/logo/link.** The repo already has a `Player` sponsor tier
(`TIER_ORDER`, seeded Sunscape Solar and Central Insurance) so player sponsors ARE rows in `sponsors`;
one logo upload then serves the sponsors page, the home carousel and the player tile. An inline
alternative would duplicate logos and links. Cost: a one-off sponsor must be added to Sponsors first
(the relationship field has "create new" inline in the admin).

Access: public read of rows where `active = true` AND the player is not hidden
(`player.hidden = false`); staff create/update/delete and read everything. The Local API runs with
override, so `lib/player-sponsors-queries.ts` repeats both filters and also skips rows whose player
or sponsor is missing.

Public display:
- `/players`: gold-edged "Player sponsors" band above the directory. Tile: player photo (identity
  rule), player name -> profile, sponsor logo/name -> sponsor site, season and message.
- `/players/[slug]`: "Sponsored by" block with every active sponsor.
- `/sponsors`: the existing Player tier shows "Sponsors <player>" under a linked sponsor, plus a pointer to the players band.

Admin: everyday nav "Player sponsors", dashboard tile "Add a player sponsor", columns player/sponsor/active.
No ETL (new data); `verify.ts` does not enumerate it.

## 3. Club apparel link

Stored in a small new global `club-apparel` (`apparelUrl`, `apparelLabel` default "Club apparel",
`apparelBlurb`) **instead of the `club` global**: `club` is admin-only and hidden from editors, and
the committee must be able to change this link. Flipping `club` to staff-writable would mean
re-locking every other field by hand, which risks weakening access control. The new global is
`update: isStaff`, appears in the everyday nav and as a dashboard tile. `getClub()` merges it as
`club.apparel`, so every consumer still reads from "the club".

`apparelUrl` is validated http(s) only (`httpUrlOrEmpty`). **When empty nothing renders**: no nav
button, no banner, no footer link.

Placement: distinct gold button in the desktop nav (before "Get in touch") and the mobile menu; a
black strip on the home page between the hero and the sponsor carousel; the footer "Find us" column.
Always `target="_blank" rel="noopener noreferrer"`.

Seed default: none. No merchandise URL exists in this repo or in `main` history; the committee
supplies it in the admin. Nothing is invented.

## Admin caps

`tests/admin-visibility.test.ts`: everyday nav cap 12 -> 14 (player sponsors, club apparel; each
needs an everyday entry so the committee can reach it); job tile cap 8 -> 9.

## Testing

Unit: `lib/identity.ts` resolver, apparel resolver and URL validation, PersonCard/Avatar markup,
nav/footer/banner apparel rendering, grep test. Int: person edit via Local API changes what home,
`/people`, `/contact` and a linked player's tile/profile render; player-sponsors access (anonymous
sees only active, hidden player excluded, anonymous POST 403); apparel global access.
