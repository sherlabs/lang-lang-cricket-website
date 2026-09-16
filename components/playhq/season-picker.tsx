'use client'

import { useId } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { SeasonGroup } from '@/lib/playhq/types'
import { seasonHref } from '@/lib/playhq/format'

type Props = { groups: SeasonGroup[]; current: string; basePath: string }

/** Season <select>; navigates with ?season=… and preserves any ?team filter. */
export function SeasonPicker({ groups, current, basePath }: Props) {
  const router = useRouter()
  const params = useSearchParams()
  const id = useId()
  const team = params.get('team')

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="eyebrow">
        Season
      </label>
      <select
        id={id}
        key={current}
        defaultValue={current}
        onChange={(e) => router.push(seasonHref(basePath, e.target.value, team))}
        className="min-h-11 rounded-md border border-brand-black/15 bg-white px-3 text-sm text-brand-black"
      >
        {groups.map((g) => (
          <option key={g.name} value={g.name}>
            {g.name}
            {g.status === 'UPCOMING' ? ' (upcoming)' : ''}
          </option>
        ))}
      </select>
    </div>
  )
}
