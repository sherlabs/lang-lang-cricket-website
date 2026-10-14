# Admin audit on the live preview (2026-10-13)

Walked through the deployed preview admin (feat/payload-cms @ a7d5540) in Chrome, signed in as an admin, 1512px wide. The club owner's verdict: "the admin ui is so bad", "social posts are so bad". This file is the starting evidence for the admin redesign wave.

## P0: broken behaviour

1. **Hard loads bounce through a blank login page.** Opening `/admin`, `/admin/office` or `/admin/social` directly (address bar, refresh, a shared link) first lands on `/admin/login?redirect=...`, which shows a completely blank cream page for 10 to 20 seconds, then the client eventually ends up on the right page. Network shows `HEAD /admin/office` 503, `GET /admin/office?_rsc=` 503 and `/admin/login?...&_rsc=` 503 while this happens (the preview sits behind Vercel deployment protection; `/.well-known/vercel/jwe` also 503). Collection pages such as `/admin/collections/players` load directly without the bounce. Find the real cause (custom views' server-side auth check vs Payload's own, cookie name/prefix, `redirect` handling, RSC prefetch/HEAD requests under protection) and make every admin URL load straight to its page with no blank screen. The login page must never render blank.
2. **Deep links lose their state.** `/admin/social?type=sponsor-thanks&source=13%2C17&style=bold&size=landscape` ends up at `/admin/social` with nothing selected (the query string is dropped through the login bounce, and/or the composer does not read its state from the URL on first load). Shared links to a graphic must open that exact graphic.
3. **First clicks are ignored.** On a fresh load of Social posts, clicking a tile did nothing (no hydration error in the console; a later JS click worked). Likely the page is not hydrated for many seconds. Show something interactive fast, and make slow regions skeletons rather than dead UI.

## Social posts (`/admin/social`): owner says "so bad"

- One very long vertical form: 10 type tiles, then "Which one?" as a long radio list (every game of the season as a plain sentence, no grouping, no search, no dates as a column), then show options, then "2. Check the picture", then "3. Use it", then captions, then "Your posts". The preview is far below the fold, so you change a choice and cannot see the effect.
- Picking a game: the list is cramped plain text such as "9. Senior Men 1 Day Comp Round 14 v Upper Beaconsfield Cricket Club, Sat 7 Mar, lost". Grade numbering prefixes ("9.", "4.") leak through; no result badge, no score, no team crest.
- Sponsor thank-you: each sponsor row repeats "X has no logo we can draw, so the name is shown." in grey after the name. That is 10 of 12 rows of noise. Sponsors visibly have logos on the public site, so the "no logo we can draw" detection is probably wrong (format, e.g. SVG/WebP, or the logo field not used) — fix the detection, then show a small logo thumbnail in the picker instead of a sentence.
- The graphic itself (bold, square, 2 sponsors): small logos stuck top-left, about 60% of the canvas is empty black; looks unfinished. The results graphic truncates the opposition name ("Upper Beaconsfield Cricke...") and shows the internal team name "Lang Lang One Day". Graphics need real layout work: balanced composition for 1 to 4 items, auto-fit text instead of ellipses, public team names.
- Size buttons show "1080 x 1080" in low-contrast grey on yellow; style radios use default browser radio buttons; the "Thank-you line" input floats far from the picture it affects.
- "Your posts" sits at the bottom with "Not checked yet" and four filter buttons, which reads as broken when empty.
- Expected shape for an award-quality composer: left column steps (type, item, options, caption), right column a sticky live preview with size tabs and download/share/schedule actions; a searchable item picker with rich rows; a posts list on its own tab.

## Home (`/admin`)

- 14 equal-weight yellow-edged tiles in a 6-column grid, then a pale-yellow "Needs your attention" box whose content is technical ("Matches saved: 0. Matches that did not save: 0. Players whose match totals disagree with their season totals: 0. Open the sync runs"), then a "Milestones" bullet list with underlined links, then "Advanced (site administrators)" dashed box. No hierarchy; nothing tells you what matters today.
- "Needs your attention" shows even when there is nothing to do, and shows sync internals to committee members.

## Lists and forms (Players as the example)

- Default Payload list: plain columns, "Hide from the website" shows raw `true` / `false` code-style pills, no photo column, sort arrows on every column, 10 per page, search placeholder "Search by Display Name Or Slug" (jargon).
- Edit page: long help paragraphs under every field, the photo field is an empty grey box, "Slug", "Is Active Derived", "Show as: Select a value" and other internal fields sit in the sidebar for a committee member; the breadcrumb starts with a tiny crest; "Last Modified / Created" metadata bar is prominent. Save button is small and yellow in the corner.

## Shell

- Sidebar is a plain text list of 15 items with no icons or grouping and a collapsed "ADVANCED" toggle; active state is a yellow pill. Logout is a bare icon at the bottom left. No search, no quick switch.
- Overall look is default Payload with cream background and yellow accents: low contrast greys for help text, inconsistent card borders (some yellow left-borders, some plain), default browser radios and checkboxes inside custom views.

## Re-check on the preview after WP-0 to WP-3 (2026-10-14, 0d69965)

Fixed: the shared Social link now opens the exact graphic; the composer is two columns with a live preview; the Home is clear. Still to fix:

- Social sponsor picker: the thumbnail box next to each sponsor is empty, though the graphic renders the logos. Show the logo in the row.
- Social sponsor picker: the search placeholder says "Search by team, grade, date or name" for sponsors. Use per-type copy ("Search sponsors").
- Hard load still shows an empty screen for about 2 seconds before the shell paints (was 10 to 20).
- Home "Season at a glance" shows one team only (B Grade). Show every current team, or say which one it is and why.
