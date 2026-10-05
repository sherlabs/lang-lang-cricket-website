/** The "who has not replied" reminder a selector copies and sends. Link and club name come from the caller (config), never from here. */
export function reminderText(i: { gradeName: string; opponent: string; when: string; names: readonly string[]; availabilityUrl: string | null }): string {
  const first = i.names.length ? `${i.names.join(', ')}: ` : ''
  const link = i.availabilityUrl ? ` ${i.availabilityUrl}` : ''
  return `${first}can you let the selectors know if you can play ${i.gradeName} v ${i.opponent} (${i.when})?${link}`
}
