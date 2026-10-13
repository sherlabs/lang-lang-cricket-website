// @committee-facing
import { Gutter } from '@payloadcms/ui'
import { Suspense } from 'react'
import { getClub } from '@/lib/club'
import type { Payload } from 'payload'
import { homeTiles } from '../admin/navigation'
import { isAdminUser } from '../admin/visibility'
import { AttentionPanel, HomeLead } from './AttentionPanel'
import { loadHomeFacts } from './homeFacts'
import { MilestonesWidget } from './MilestonesWidget'
import { SeasonGlanceCard } from './SeasonGlanceCard'
import { SystemHealth } from './SystemHealth'
import { Disclosure } from './ui/Disclosure'
import { Icon } from './ui/Icon'
import { PageHeader } from './ui/PageHeader'
import { Section } from './ui/Card'
import { Skeleton, SkeletonRows } from './ui/Skeleton'

type User = { role?: string | null; name?: string | null; email?: string | null } | null | undefined

function firstName(user: User): string {
  const raw = user?.name?.trim() || user?.email?.split('@')[0] || ''
  return raw.split(/\s+/)[0] ?? ''
}

/**
 * `admin.components.views.dashboard.Component` (RSC): the Home page, top to bottom.
 * Greeting and one sentence for today, "Needs your attention" (only when there is something to do), the quick actions (a few big
 * buttons and a "More" list), Season at a glance, Milestones, and for administrators a closed Advanced area with System health.
 */
export async function Dashboard({ payload, user }: { payload: Payload; user?: User }) {
  const adminRoute = payload.config.routes.admin
  const club = await getClub()
  const name = firstName(user)
  const admin = isAdminUser(user)
  const facts = loadHomeFacts(payload, admin, user)
  facts.catch(() => undefined)
  const { primary, more } = homeTiles()

  return (
    <Gutter><main id="admin-main" className="club-home" aria-label={`${club.name} website admin`}>
      <PageHeader title={name ? `Hello, ${name}` : 'Hello'} />
      <Suspense fallback={<p className="club-home__today"><Skeleton width="14rem" height="1.1rem" /></p>}>
        <HomeLead facts={facts} />
      </Suspense>

      <Suspense fallback={<SkeletonRows rows={2} label="Loading what needs your attention" />}>
        <AttentionPanel facts={facts} />
      </Suspense>

      <Section title="Quick actions" id="actions">
        <ul className="club-actions">
          {primary.map((tile) => (
            <li key={tile.key}>
              <a className="club-action" href={`${adminRoute}${tile.path}`}>
                <Icon name={tile.icon} size={22} />
                <span className="club-action__title">{tile.title}</span>
              </a>
            </li>
          ))}
        </ul>
        {more.length > 0 && (
          <Disclosure summary="More" className="club-more">
            <ul className="club-more__list">
              {more.map((tile) => (
                <li key={tile.key}>
                  <a className="club-more__link" href={`${adminRoute}${tile.path}`}>
                    <Icon name={tile.icon} size={18} />
                    <span>{tile.title}</span>
                  </a>
                </li>
              ))}
            </ul>
          </Disclosure>
        )}
      </Section>

      <div className="club-home__cards">
        <Suspense fallback={<SkeletonRows rows={3} label="Loading the season" />}>
          <SeasonGlanceCard payload={payload} />
        </Suspense>
        <Suspense fallback={<SkeletonRows rows={3} label="Loading milestones" />}>
          <MilestonesWidget payload={payload} />
        </Suspense>
      </div>

      {admin && (
        <Disclosure summary="Advanced (site administrators)" className="club-advanced">
          <Suspense fallback={<SkeletonRows rows={3} label="Loading System health" />}>
            <SystemHealth payload={payload} facts={facts} />
          </Suspense>
        </Disclosure>
      )}
    </main></Gutter>
  )
}
