/**
 * One-off: propose (and optionally write) links from `people` to `players` by EXACT normalised
 * name, so a committee member who also plays has one identity (their photo is then used on the
 * Players pages; see lib/identity.ts). DRY RUN by default: it only reports.
 *
 *   pnpm payload run payload/scripts/link-people-players.ts -- --target 127.0.0.1/langlang_dev
 *   pnpm payload run payload/scripts/link-people-players.ts -- --target 127.0.0.1/langlang_dev --apply --confirm
 *
 * Reports matched / ambiguous / unmatched / already linked. Never guesses: only clean one-to-one
 * exact-name matches are written, and only with --apply (plus the guard's --confirm).
 * Local-and-operator-safe: the usual guard (--target must equal DATABASE_URI; remote hosts need
 * ALLOW_REMOTE_DB=yes). Writes skip cache revalidation; the pages are dynamic.
 */
import config from '@payload-config'
import { getPayload } from 'payload'
import { planLinks } from '../../lib/people-link-plan'
import { guard } from './_guard'

async function main() {
  const apply = process.argv.includes('--apply')
  await guard({ write: apply })
  const payload = await getPayload({ config })
  try {
    const [people, players] = await Promise.all([
      payload.find({ collection: 'people', pagination: false, depth: 0, overrideAccess: true }),
      payload.find({ collection: 'players', pagination: false, depth: 0, joins: false, overrideAccess: true }),
    ])
    const plan = planLinks(
      people.docs.map((p) => ({ id: p.id, name: p.name, playerId: typeof p.player === 'number' ? p.player : (p.player?.id ?? null) })),
      players.docs.map((p) => ({ id: p.id, name: p.displayName || `${p.firstName} ${p.lastName}`.trim(), hidden: Boolean(p.hidden) })),
    )
    console.log(`[link] ${people.totalDocs} people, ${players.totalDocs} players`)
    for (const m of plan.matches) console.log(`[link] MATCH     ${m.personName} (#${m.personId}) -> ${m.playerName} (#${m.playerId})${m.playerHidden ? ' [player is hidden]' : ''}`)
    for (const a of plan.ambiguous) console.log(`[link] AMBIGUOUS ${a.personName} (#${a.personId}): ${a.reason} (players ${a.playerIds.join(', ')}) - not linked`)
    for (const u of plan.unmatched) console.log(`[link] UNMATCHED ${u.personName} (#${u.personId}): no player has this exact name`)
    for (const l of plan.alreadyLinked) console.log(`[link] LINKED    ${l.personName} (#${l.personId}) -> player #${l.playerId} already`)
    console.log(`[link] summary: ${plan.matches.length} to link, ${plan.ambiguous.length} ambiguous, ${plan.unmatched.length} unmatched, ${plan.alreadyLinked.length} already linked`)
    if (!apply) {
      console.log('[link] dry run: nothing written. Re-run with --apply --confirm to write the MATCH lines.')
      return
    }
    for (const m of plan.matches) {
      await payload.update({ collection: 'people', id: m.personId, data: { player: m.playerId }, overrideAccess: true, depth: 0, context: { disableRevalidate: true } })
    }
    console.log(`[link] wrote ${plan.matches.length} link(s)`)
  } finally {
    await payload.destroy()
  }
}

try {
  await main()
} catch (err) {
  console.error(err)
  process.exit(1)
}
