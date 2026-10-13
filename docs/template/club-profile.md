# Club profile reference

`clubs/<slug>/profile.json` describes a club. It is JSON only (no YAML). Any key called `_comment` is ignored, so you can annotate it. `pnpm bootstrap:club` validates it first and prints a per-field error list when something is wrong, before it touches the database.

**A profile never holds a password.** Any key whose name contains `password` is rejected, anywhere in the file. The first admin's password comes from the `INITIAL_ADMIN_PASSWORD` environment variable.

## `club`

| Field | Required | Notes |
| --- | --- | --- |
| `name` | yes | Full name, for example "Riverbend Cricket Club". |
| `shortName` | yes | Short form, for example "Riverbend CC". |
| `familiarName` | no | How running copy refers to the club ("Life at Riverbend"). Derived from `shortName` when absent. |
| `tagline` | no | Shown under the name. Defaults to "`location`, `region`". |
| `location` | yes | The town or suburb. |
| `region` | yes | The state or region name. |
| `country` | yes | Two-letter country code, for example `AU`. |
| `sport` | no | Defaults to Cricket. |
| `email` | yes | The public club email. |
| `siteUrl` | yes | `https://` and the site address only, no path. It must match `CANONICAL_HOST`. |
| `socials` | no | List of `{ platform, url, label }`. Platforms: facebook, instagram, x, youtube, tiktok. An empty `url` shows the label as plain text. |
| `supportedBy` | no | Becomes the footer line "Proudly supported by ...". |

## `region`

`locale` (for example `en-AU`), `timezone` (an IANA name, checked), `currency` (an ISO code with cents), `seasonStartMonth` (1 to 12) and `seasonNameFormat` (`split` for 2025/26, `single` for 2026). The locale and currency are written to Club details and Club office settings; the timezone and season values are environment variables (the script prints them).

## `theme`

`accent` is the only required colour. Optional: `primary`, `surface`, `text`, `muted` (six digit hex) and `headingFont` (one of barlow-condensed, oswald, bebas-neue, anton, playfair-display). Missing colours use the neutral defaults; the extra shades are derived from the accent. **Every text and background pair is checked for contrast** (the same rules as the admin Site look page); a pair that fails is an error naming the pair and its ratio. Advisory pairs (captions, the focus ring) are printed as notes.

## `playhq`

`orgId` (the PlayHQ organisation id, a UUID), `teamPrefix` (the club name as PlayHQ puts it before a team name), optional `clubUrl`. These must match the `PLAYHQ_*` environment variables; the script cannot set host variables, it prints the lines to set.

## `office`

Only `currency` is supported. Fees, volunteer jobs and the rest are edited in the admin.

## `admin`

`email` and `name` of the first admin.

## `assets`

`logo`, `hero`, `ogImage`, `favicon`: paths **inside the club folder** (no `..`, no absolute paths). Each must exist, be a png, jpg, jpeg, webp or ico, and stay within its size limit (logo 2 MB, hero 5 MB, share image 1 MB, favicon 0.5 MB). They are uploaded to the media library and set on Club details.

## `copy`

Optional overrides of the neutral wording, in the same shape as the club defaults. Only the fields editable in Club details (search text, history, contact) are saved; the home page, page headings and menus are built from the saved club identity and cannot be overridden from the profile.
