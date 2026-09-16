import { describe, it, expect } from 'vitest'
import { displayName } from '@/lib/playhq/names'

describe('displayName', () => {
  it('senior: full name', () => expect(displayName({ firstName: 'Russell', lastName: 'Savige' }, false)).toBe('Russell Savige'))
  it('junior: first + initial', () => expect(displayName({ firstName: 'Jack', lastName: 'Smith' }, true)).toBe('Jack S.'))
  it('junior: missing last name', () => expect(displayName({ firstName: 'Jack', lastName: '' }, true)).toBe('Jack'))
  it('trims and title-cases shouting names', () => expect(displayName({ firstName: 'ARSHBIR', lastName: 'SINGH' }, false)).toBe('Arshbir Singh'))
})
