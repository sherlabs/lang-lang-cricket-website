/**
 * Junior-classification patterns shared by the PlayHQ sync (`lib/playhq/seasons.ts`,
 * `queries.ts`) and the stats grade classifier (`lib/stats/categories.ts`), so the two can
 * never drift. Pure: no `server-only`, no Payload or Next imports.
 *
 * `boys` and `youth` are deliberate additions to the old sync rules; they only widen the
 * junior filter. `under` now needs an age ("Under 16"), so a grade like "Thunder" is no
 * longer mistaken for a junior grade.
 */

/** Alternation (no anchors) of the junior words that appear in a grade or team name. */
export const JUNIOR_GRADE_WORDS = String.raw`u\s?-?\d{1,2}|under\s?-?\d{1,2}|juniors?|girls|boys|youth`

/** Whole-word junior match for a grade or team name. */
export const JUNIOR_GRADE_RE = new RegExp(String.raw`\b(?:${JUNIOR_GRADE_WORDS})\b`, 'i')

/** Competition names: also catches the Winter competition, which the club does not stat. */
export const JUNIOR_COMPETITION_RE = /junior|u1\d|girls|winter|boys|youth/i
