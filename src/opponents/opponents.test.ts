import { describe, expect, it } from 'vitest'
import { t } from '../i18n/index.ts'
import { FRIEND_ID, opponentById, opponents } from './opponents.ts'

describe('opponents', () => {
  it('offers five computer personas and one hot-seat option', () => {
    expect(opponents.filter((o) => o.kind === 'computer')).toHaveLength(5)
    expect(opponents.filter((o) => o.kind === 'human')).toHaveLength(1)
    expect(opponents.map((o) => o.id)).toContain(FRIEND_ID)
  })

  it('has a Russian name and tagline for every opponent', () => {
    for (const o of opponents) {
      expect(t.opponents[o.id].name).toMatch(/[А-Яа-яЁё]/)
      expect(t.opponents[o.id].tagline.length).toBeGreaterThan(0)
    }
  })

  it('looks opponents up by id and rejects unknown ids', () => {
    expect(opponentById('fox')).toEqual({ id: 'fox', kind: 'computer' })
    expect(() => opponentById('nope')).toThrow(/opponent/)
  })
})
