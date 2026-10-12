// @vitest-environment jsdom
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RotationTimer, type TimerActions } from '@/components/nets/rotation-timer'
import { buildRotation } from '@/lib/nets/rotation'
import type { NetSnapshot } from '@/lib/nets/snapshot'

const refresh = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }), usePathname: () => '/selector/nets/1' }))
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const MIN = 60_000
const T0 = Date.UTC(2026, 9, 12, 8, 0, 0)
const players = Array.from({ length: 9 }, (_, i) => ({ key: `player:${i + 1}`, name: `Player ${i + 1}` }))
const plan = buildRotation({ players, nets: 1, groupSize: 3 }) // three rounds

const snap = (over: Partial<NetSnapshot> = {}): NetSnapshot => ({
  id: 1, title: 'Nets', date: '2026-10-12', state: 'running', nets: 1, minutesPerTurn: 10, groupSize: 3, round: 0, roundStartedAt: T0, pausedAt: null, revision: 2, rounds: 3, plan, serverNow: T0 + 1000, ...over,
})
const fakeActions = (result: NetSnapshot): TimerActions => {
  const ok = vi.fn(async () => ({ ok: true as const, snapshot: result }))
  return { build: ok, start: ok, pause: ok, resume: ok, next: ok, finish: ok }
}

describe('RotationTimer', () => {
  let host: HTMLElement
  let root: Root
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] })
    vi.setSystemTime(T0 + 1000)
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })))
  })
  afterEach(() => {
    act(() => root.unmount())
    host.remove()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    delete (navigator as { wakeLock?: unknown }).wakeLock
  })
  const render = (s: NetSnapshot, actions = fakeActions(s)) => {
    act(() => root.render(createElement(RotationTimer, { initial: s, actions, statePath: '/selector/nets/1/state', canBuild: false })))
    return actions
  }
  const time = () => host.querySelector('[role="timer"]')!.textContent
  const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms))

  it('counts down from the server time and is a timer that is not announced every second', () => {
    render(snap())
    const t = host.querySelector('[role="timer"]')!
    expect(t.getAttribute('aria-live')).toBe('off')
    advance(300)
    expect(time()).toBe('9:59')
    advance(60_000)
    expect(time()).toBe('8:59')
    expect(host.textContent).toContain('Round 1 of 3')
    expect(host.textContent).toContain('Player 1, Player 2, Player 3')
  })

  it('rolls into the next round by itself, with no action and no write', () => {
    const actions = render(snap())
    advance(10 * MIN)
    expect(host.textContent).toContain('Round 2 of 3')
    expect(host.textContent).toContain('Player 4, Player 5, Player 6')
    expect(time()).toMatch(/^(10:00|9:5\d)$/)
    for (const fn of Object.values(actions)) expect(fn).not.toHaveBeenCalled()
  })

  it('corrects for a device clock that is behind the server', () => {
    vi.setSystemTime(T0 - 5 * MIN) // the phone thinks it is five minutes earlier
    render(snap({ serverNow: T0 + 2 * MIN }))
    advance(1500)
    expect(time()).toBe('7:59')
  })

  it('a paused timer stands still however long the tab waits, and Resume is offered', () => {
    render(snap({ state: 'paused', pausedAt: T0 + 4 * MIN, serverNow: T0 + 20 * MIN }))
    vi.setSystemTime(T0 + 40 * MIN)
    advance(5000)
    expect(time()).toBe('6:00')
    expect(host.textContent).toContain('(paused)')
    expect([...host.querySelectorAll('button')].map((b) => b.textContent)).toEqual(expect.arrayContaining(['Resume', 'Next round', 'Finish']))
  })

  it('Pause calls the action and shows what the server answers', async () => {
    const paused = snap({ state: 'paused', pausedAt: T0 + 2 * MIN, revision: 3, serverNow: T0 + 2 * MIN })
    const actions = render(snap(), fakeActions(paused))
    const pause = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Pause')!
    await act(async () => pause.click())
    expect(actions.pause).toHaveBeenCalledWith({ sessionId: 1 })
    expect(host.textContent).toContain('(paused)')
    expect(refresh).toHaveBeenCalled()
  })

  it('shows the reason when an action does not apply', async () => {
    const actions = render(snap())
    ;(actions.pause as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, error: 'Someone else just changed this session.' })
    await act(async () => [...host.querySelectorAll('button')].find((b) => b.textContent === 'Pause')!.click())
    expect(host.querySelector('[role="alert"]')!.textContent).toContain('Someone else')
  })

  it('works without the wake lock API, and uses one when there is one and releases it on pause', async () => {
    render(snap())
    expect(time()).toBeTruthy()
    act(() => root.unmount())
    const release = vi.fn(async () => undefined)
    const request = vi.fn(async () => ({ release }))
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true })
    root = createRoot(host)
    await act(async () => root.render(createElement(RotationTimer, { initial: snap(), actions: fakeActions(snap()), statePath: '/s', canBuild: false })))
    expect(request).toHaveBeenCalledWith('screen')
    await act(async () => root.render(createElement(RotationTimer, { initial: snap({ state: 'paused', pausedAt: T0, revision: 3 }), actions: fakeActions(snap()), statePath: '/s', canBuild: false })))
    expect(release).toHaveBeenCalled()
  })

  it('refetches when the tab becomes visible again', async () => {
    const fresh = snap({ state: 'paused', pausedAt: T0 + 3 * MIN, revision: 5, serverNow: T0 + 5 * MIN })
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => fresh })))
    render(snap())
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    await act(async () => void document.dispatchEvent(new Event('visibilitychange')))
    expect(fetch).toHaveBeenCalledWith('/selector/nets/1/state', expect.objectContaining({ cache: 'no-store' }))
    expect(host.textContent).toContain('(paused)')
  })

  it('shows the groups before the start and a finished message after', () => {
    render(snap({ state: 'planned', roundStartedAt: null, round: 0, revision: 1 }))
    expect(host.textContent).toContain('3 rounds of 10 minutes')
    expect(host.textContent).toContain('Round 2, net 1')
    act(() => root.render(createElement(RotationTimer, { initial: snap({ state: 'finished', revision: 9 }), actions: fakeActions(snap()), statePath: '/s', canBuild: false })))
    expect(host.textContent).toContain('This session is finished')
  })
})
