// @vitest-environment jsdom
import { createElement, act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { gameRow } from '@/lib/social/game-rows'
import type { QueueRowView } from '@/lib/social/queue-rows'
import type { SourceChoice } from '@/lib/social/types'
import { SearchPicker } from '@/payload/components/social/SearchPicker'
import { SocialQueue } from '@/payload/components/SocialQueue'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@payloadcms/ui', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/social-actions', () => ({ deleteQueuedPost: vi.fn(), markNetworkNotPosted: vi.fn(), markNetworkPosted: vi.fn(), pauseScheduledPost: vi.fn(), retryFailedPost: vi.fn() }))
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
// jsdom has no layout: scrolling into view is a no-op here.
Element.prototype.scrollIntoView = () => undefined

const game = (id: string, opp: string, date: string, letter: string): SourceChoice => ({
  id, label: `B Grade v ${opp}`, row: gameRow({ date, grade: 'B Grade', round: 'Round 14', opposition: opp, letter, clubName: 'Test CC', clubScore: '5/172', oppScore: '9/168' }, 'en-AU'),
})
const sponsor = (id: string, name: string, logo: 'ok' | 'none' | 'failed'): SourceChoice => ({ id, label: `${name} (Gold)`, row: { kind: 'sponsor', name, tier: 'Gold', logo } })

describe('SearchPicker', () => {
  let host: HTMLElement
  let root: Root
  beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host) })
  afterEach(() => { act(() => root.unmount()); host.remove() })
  const render = async (props: Partial<Parameters<typeof SearchPicker>[0]> & Pick<Parameters<typeof SearchPicker>[0], 'choices'>) => {
    const onChange = vi.fn()
    await act(async () => { root.render(createElement(SearchPicker, { multi: false, selected: [], onChange, api: '/api/admin/social', locale: 'en-AU', label: 'Games', empty: 'None', ...props })) })
    return onChange
  }
  const input = () => host.querySelector<HTMLInputElement>('input[role="combobox"]')!
  const type = async (value: string) => {
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      set.call(input(), value)
      input().dispatchEvent(new Event('input', { bubbles: true }))
    })
  }
  const key = async (k: string) => { await act(async () => { input().dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })) }) }
  const options = () => [...host.querySelectorAll('[role="option"]')]

  it('shows a game with its date tile, grade and round, opposition, score and result badge, grouped by round', async () => {
    await render({ choices: [game('1', 'Hilltop CC', '2025-10-11', 'W'), game('2', 'Bay Rovers', '2025-10-04', 'L')] })
    expect(host.querySelector('.social-group__heading')?.textContent).toBe('Round 14')
    const first = options()[0]
    expect(first.textContent).toContain('11')
    expect(first.textContent).toContain('Oct')
    expect(first.textContent).toContain('B Grade, Round 14')
    expect(first.textContent).toContain('v Hilltop CC')
    expect(first.textContent).toContain('Test CC 5/172 v Hilltop CC 9/168')
    expect(first.textContent).toContain('Won')
    expect(options()[1].textContent).toContain('Lost')
  })

  it('shows sponsor logo thumbnails from the staff endpoint, and a plain "name only" tag when there is no usable logo', async () => {
    await render({ multi: true, choices: [sponsor('7', 'Harbour Hardware', 'ok'), sponsor('8', 'Corner Cafe', 'none'), sponsor('9', 'Bad Logo Co', 'failed')] })
    expect(options()[0].querySelector('img')?.getAttribute('src')).toBe('/api/admin/social/logo/7')
    expect(options()[0].textContent).not.toContain('name only')
    expect(options()[1].querySelector('img')).toBeNull()
    expect(options()[1].textContent).toContain('name only')
    expect(options()[2].textContent).toContain('name only')
    expect(host.textContent).not.toContain('no logo we can draw')
  })

  it('searches, moves with the arrow keys and chooses with Enter, and Escape clears the search', async () => {
    const onChange = await render({ choices: [game('1', 'Hilltop CC', '2025-10-11', 'W'), game('2', 'Bay Rovers', '2025-10-04', 'L'), game('3', 'Hilltop Juniors', '2025-09-27', 'T')] })
    await type('hilltop')
    expect(options()).toHaveLength(2)
    expect(options()[0].className).toContain('is-active')
    expect(input().getAttribute('aria-activedescendant')).toBe(options()[0].id)
    await key('ArrowDown')
    expect(input().getAttribute('aria-activedescendant')).toBe(options()[1].id)
    await key('Enter')
    expect(onChange).toHaveBeenCalledWith(['3'])
    await key('Escape')
    expect(input().value).toBe('')
    expect(options()).toHaveLength(3)
    await type('zzz')
    expect(host.textContent).toContain('Nothing matches')
  })

  it('in multi mode shows chips, allows four and says so when a fifth is tried', async () => {
    const choices = ['A', 'B', 'C', 'D', 'E'].map((n, i) => sponsor(String(i + 1), `${n} Sponsor`, 'none'))
    const onChange = await render({ multi: true, choices, selected: ['1', '2', '3', '4'] })
    expect(host.querySelectorAll('.social-chip')).toHaveLength(4)
    expect(host.textContent).toContain('Choose up to 4. 4 chosen.')
    await act(async () => { options()[4].dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(onChange).not.toHaveBeenCalled()
    expect(host.querySelector('[role="status"]')?.textContent).toContain('4 already')
    await act(async () => { host.querySelector<HTMLButtonElement>('button[aria-label="Remove A Sponsor"]')!.click() })
    expect(onChange).toHaveBeenCalledWith(['2', '3', '4'])
  })
})

describe('SocialQueue (the Posts tab)', () => {
  let host: HTMLElement
  let root: Root
  beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host) })
  afterEach(() => { act(() => root.unmount()); host.remove() })
  const heartbeat = { plain: 'Posts are sent by a scheduled job on the server. The last run was 2 hours ago.', warning: null, cadence: null }
  const row = (over: Partial<QueueRowView>): QueueRowView => ({ id: 1, title: 'Round 14 results', tab: 'drafts', status: 'draft', chip: { icon: '✎', label: 'Draft', tone: 'idle' }, when: 'No time chosen', caption: 'Great win today', thumbSize: 'square', targets: [], canEdit: true, canPause: false, canPostNow: false, canRetry: false, canDelete: true, hasUnknown: false, ...over })

  it('with no posts at all, says so plainly and offers the one next step, with the scheduler in plain English', async () => {
    await act(async () => { root.render(createElement(SocialQueue, { api: '/api/admin/social', rows: [], initialTab: 'scheduled', heartbeat, editBase: '/admin/social?post=', makeHref: '/admin/social' })) })
    expect(host.textContent).toContain('Nothing waiting. Make a post to get started.')
    expect(host.querySelector('a')?.textContent).toBe('Make a post')
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/admin/social')
    expect(host.textContent).toContain('The last run was 2 hours ago.')
    expect(host.textContent).not.toContain('Not checked yet')
  })

  it('with posts, shows counts, a picture, the start of the caption and the networks as pills', async () => {
    const rows = [
      row({ id: 1 }),
      row({ id: 2, tab: 'scheduled', status: 'scheduled', chip: { icon: '◷', label: 'Scheduled', tone: 'info' }, when: 'Sat 18 Oct, 6:30 pm', targets: [{ id: 5, network: 'facebook', label: 'Facebook', size: 'square', sizeLabel: 'Square', status: 'pending', line: 'Facebook: waiting to post', fallback: false, finalText: 'x', canMarkPosted: false, canMarkNotPosted: false }] }),
    ]
    await act(async () => { root.render(createElement(SocialQueue, { api: '/api/admin/social', rows, initialTab: 'scheduled', heartbeat, editBase: '/admin/social?post=', makeHref: '/admin/social' })) })
    expect(host.querySelector('.social-seg')?.textContent).toContain('Scheduled 1')
    expect(host.querySelector('.social-seg')?.textContent).toContain('Drafts 1')
    const post = host.querySelector('.social-post')!
    expect(post.querySelector('img')?.getAttribute('src')).toBe('/api/admin/social/post-image?post=2&size=square')
    expect(post.textContent).toContain('Great win today')
    expect(post.querySelector('.social-pills')?.textContent).toBe('Facebook')
    expect(post.textContent).toContain('Sat 18 Oct, 6:30 pm')
    // A tab with nothing in it has its own short empty state.
    await act(async () => { [...host.querySelectorAll<HTMLButtonElement>('.social-seg button')].find((b) => b.textContent?.startsWith('Posted'))!.click() })
    expect(host.textContent).toContain('Nothing has been posted yet.')
  })
})
