/**
 * The "who has not replied" reminder a selector copies and sends. Link, club name and the award's label come from the caller
 * (config), never from here. `kind` picks the sentence: `availability` (default) asks if they can play, `vote` asks them to vote.
 */
export function reminderText(i: { gradeName: string; opponent: string; when: string; names: readonly string[]; availabilityUrl: string | null } & ({ kind?: 'availability' } | { kind: 'vote'; voteLabel: string })): string {
  const first = i.names.length ? `${i.names.join(', ')}: ` : ''
  const link = i.availabilityUrl ? ` ${i.availabilityUrl}` : ''
  const game = `${i.gradeName} v ${i.opponent} (${i.when})`
  if (i.kind === 'vote') return `${first}please vote for ${i.voteLabel.toLowerCase()} in ${game}.${link}`
  return `${first}can you let the selectors know if you can play ${game}?${link}`
}
