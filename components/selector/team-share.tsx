'use client'
/* eslint-disable @next/next/no-img-element -- the lineup picture is a dynamic route, not a static asset */

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { withdrawTeamAction } from '@/app/(frontend)/selector/team-actions'
import { btnQuiet } from './styles'
import { CopyButton } from './ui'

/** Share material for a published team: the picture, a download, the copy-ready post, the public link, and Withdraw. */
export function TeamShare({ gameId, postText, publishedAt }: { gameId: string; postText: string; publishedAt: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState('')
  const stamp = new Date(publishedAt).getTime()
  const image = `/teams/${gameId}/lineup-image`
  const withdraw = () => {
    if (!window.confirm('Take this team off the public site? A picture Facebook or anyone else has already copied cannot be recalled.')) return
    start(async () => {
      const res = await withdrawTeamAction({ gameId })
      if (!res.ok) return setError(res.error)
      router.refresh()
    })
  }
  return (
    <section aria-labelledby="share" className="mt-8 rounded-2xl bg-white p-4 ring-1 ring-brand-black/10">
      <h2 id="share" className="text-lg font-bold text-brand-black">Share on Facebook</h2>
      <p className="mt-1 text-sm text-brand-grey">The picture and post below match the published team. Post them to the club page yourself; the site does not post for you.</p>
      <img src={`${image}?v=${stamp}`} width={1200} height={630} alt="The published team as a picture" className="mt-3 h-auto w-full rounded-lg ring-1 ring-brand-black/10" />
      <div className="mt-3 flex flex-wrap items-start gap-2">
        <a href={`${image}?download=1&v=${stamp}`} download className={btnQuiet}>Download picture</a>
        <CopyButton text={postText} label="Copy post text" />
        <Link href={`/teams/${gameId}`} target="_blank" className={btnQuiet}>Open public page</Link>
      </div>
      <label htmlFor="post-text" className="mt-4 block text-sm font-semibold text-brand-black">Post text</label>
      <textarea id="post-text" readOnly rows={Math.min(14, postText.split('\n').length + 1)} value={postText} onFocus={(e) => e.currentTarget.select()} className="mt-1 w-full rounded-lg border border-brand-black/20 bg-white p-3 text-sm text-brand-black" />
      <div className="mt-4 border-t border-brand-black/10 pt-4">
        <button type="button" onClick={withdraw} disabled={pending} className={`${btnQuiet} text-red-800`}>{pending ? 'Withdrawing…' : 'Withdraw this team'}</button>
        {error && <p role="alert" className="mt-2 text-sm text-red-800">{error}</p>}
      </div>
    </section>
  )
}
