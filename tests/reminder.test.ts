import { describe, expect, it } from 'vitest'
import { reminderText } from '@/lib/selection/reminder'

const base = { gradeName: 'B Grade', opponent: 'Who? CC', when: 'Sat 3 Oct', names: ['Ann', 'Bo'], availabilityUrl: 'https://club.example/a/x' }

describe('reminderText', () => {
  it('asks about availability by default', () => {
    expect(reminderText(base)).toBe('Ann, Bo: can you let the selectors know if you can play B Grade v Who? CC (Sat 3 Oct)? https://club.example/a/x')
  })
  it('asks for a vote, using the award label, without touching a question mark in a name', () => {
    expect(reminderText({ ...base, kind: 'vote', voteLabel: 'Player of the Match' })).toBe('Ann, Bo: please vote for player of the match in B Grade v Who? CC (Sat 3 Oct). https://club.example/a/x')
  })
  it('leaves out the names and the link when there are none', () => {
    expect(reminderText({ ...base, names: [], availabilityUrl: null, kind: 'vote', voteLabel: 'Best player' })).toBe('please vote for best player in B Grade v Who? CC (Sat 3 Oct).')
  })
})
