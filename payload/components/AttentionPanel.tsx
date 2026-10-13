// @committee-facing
import { greetingLine } from '@/lib/admin/attention'
import { LinkButton } from './ui/Button'
import { Section } from './ui/Card'
import { StatusPill } from './ui/StatusPill'
import type { HomeFacts } from './homeFacts'

/** The one sentence under the greeting: how many things are waiting. Streams in with the list. */
export async function HomeLead({ facts }: { facts: Promise<HomeFacts> }) {
  const { items } = await facts
  return <p className="club-home__today">{greetingLine(items.length)}</p>
}

/**
 * "Needs your attention": a task per row in plain English, one button each, a count badge. Drawn only when there is something to do;
 * with nothing waiting there is no box at all.
 */
export async function AttentionPanel({ facts }: { facts: Promise<HomeFacts> }) {
  const { items } = await facts
  if (items.length === 0) return null
  return (
    <Section title="Needs your attention" id="attention" className="club-home__attention">
      <ul className="club-attention__rows">
        {items.map((item) => (
          <li key={item.key} className="club-attention__row">
            <StatusPill tone="warn" label={`${item.count}`}>{item.count}</StatusPill>
            <span className="club-attention__text">{item.text}</span>
            {item.action && item.href ? (
              <LinkButton variant="secondary" href={item.href} title={item.note}>{item.action}</LinkButton>
            ) : null}
          </li>
        ))}
      </ul>
    </Section>
  )
}
