import { beforeEach, describe, expect, it } from 'vitest'
import { fromBitPosition } from '../engine/adapter.ts'
import { moveKey } from '../engine/move.ts'
import { formatPos, initialBitPosition, parsePos } from '../engine/position.ts'
import { createRng } from '../engine/random.ts'
import { ROOT_SLOTS, search } from '../engine/search.ts'
import { EXACT, ttClear } from '../engine/tt.ts'
import { legalMoves } from '../game/moves.ts'
import { personas } from './personas.ts'
import type { Persona } from './personas.ts'
import { pickRoot, think, thinkWith } from './think.ts'

/** Fixed depth, wide margin: deterministic and visibly random. */
const loose: Persona = {
  depth: 4,
  budgetMs: 0,
  margin: 150,
  temperature: 60,
  minThinkMs: 0,
}
const strict: Persona = { ...personas.owl, depth: 6, budgetMs: 0 }

const start = formatPos(initialBitPosition())

beforeEach(() => {
  ttClear()
})

describe('think', () => {
  it('answers the request id with a legal move and its search data', () => {
    const r = think({ id: 7, position: start, persona: 'hare', seed: 1 })
    expect(r.id).toBe(7)
    expect(r.depth).toBe(personas.hare.depth)
    expect(r.nodes).toBeGreaterThan(0)
    expect(r.ms).toBeGreaterThanOrEqual(0)
    const keys = legalMoves(fromBitPosition(parsePos(start))).map(moveKey)
    expect(keys).toContain(moveKey(r.move))
  })

  it('stops early when the request caps the budget', () => {
    const deep: Persona = { ...personas.raven, depth: 64, budgetMs: 10_000 }
    const capped = thinkWith(
      { id: 1, position: start, persona: 'raven', seed: 1, budgetMs: 1 },
      deep,
    )
    expect(capped.depth).toBeLessThan(deep.depth)
  })

  it('picks the same move for the same seed', () => {
    const a = thinkWith(
      { id: 1, position: start, persona: 'hare', seed: 42 },
      loose,
    )
    ttClear()
    const b = thinkWith(
      { id: 2, position: start, persona: 'hare', seed: 42 },
      loose,
    )
    expect(moveKey(b.move)).toBe(moveKey(a.move))
  })

  it('varies the move with the seed under a wide margin', () => {
    const seen = new Set<string>()
    for (let seed = 0; seed < 24; seed++) {
      ttClear()
      const r = thinkWith(
        { id: seed, position: start, persona: 'hare', seed },
        loose,
      )
      seen.add(moveKey(r.move))
    }
    expect(seen.size).toBeGreaterThan(1)
  })

  it('never picks outside the margin or an inexact score', () => {
    const p = parsePos(
      'W:Wa1,c1,e1,b2,f2,a3,c3,e3,g3,d4,h4:Bb6,d6,f6,h6,a7,c7,e7,b8,f8,h8,e5',
    )
    const r = search(p.white, p.black, p.kings, p.side, p.plies, {
      depth: 4,
      budgetMs: 0,
      margin: loose.margin,
    })
    const best = r.root[2]!
    for (let seed = 0; seed < 50; seed++) {
      const slot = pickRoot(
        r.root,
        loose.margin,
        loose.temperature,
        createRng(seed),
      )
      expect(slot % ROOT_SLOTS).toBe(0)
      expect(r.root[slot + 3]).toBe(EXACT)
      expect(r.root[slot + 2]).toBeGreaterThanOrEqual(best - loose.margin)
    }
  })

  it('lets the owl play the best move', () => {
    const p = parsePos('W:WKd4,Kg1,a3:BKh8,b6,c7')
    const expected = search(p.white, p.black, p.kings, p.side, p.plies, {
      depth: strict.depth,
      budgetMs: 0,
      margin: 0,
    }).score
    ttClear()
    const r = thinkWith(
      { id: 1, position: formatPos(p), persona: 'owl', seed: 3 },
      strict,
    )
    expect(r.score).toBe(expected)
  })

  it('returns the full move when a man promotes in the middle of a capture', () => {
    // d6xe7 lands on f8 and promotes; the new king takes g7 and f4 and ends on c1.
    const p = parsePos('W:Wd6:Be7,g7,f4')
    const r = thinkWith(
      { id: 1, position: formatPos(p), persona: 'owl', seed: 1 },
      strict,
    )
    expect(r.move.promotes).toBe(true)
    expect(r.move.captures.length).toBe(3)
    const keys = legalMoves(fromBitPosition(p)).map(moveKey)
    expect(keys).toContain(moveKey(r.move))
  })

  it('refuses a position without moves', () => {
    expect(() =>
      thinkWith(
        { id: 1, position: 'W:W:Bd4', persona: 'owl', seed: 1 },
        strict,
      ),
    ).toThrow(/no legal moves/)
  })

  it('refuses a position drawn by the 30-ply rule', () => {
    expect(() =>
      thinkWith(
        { id: 1, position: 'W:WKa1:Bc3:30', persona: 'owl', seed: 1 },
        strict,
      ),
    ).toThrow(/drawn position/)
  })
})

describe('pickRoot', () => {
  it('chooses the only candidate without consulting the rng', () => {
    const root = Int32Array.from([1, 0, 50, EXACT, 2, 0, -300, EXACT])
    expect(pickRoot(root, 30, 15, () => 0.99)).toBe(0)
  })

  it('weights candidates by their distance to the best', () => {
    const root = Int32Array.from([
      1,
      0,
      0,
      EXACT,
      2,
      0,
      -60,
      EXACT,
      3,
      0,
      -60,
      3,
    ])
    const rng = createRng(5)
    let first = 0
    const total = 2000
    for (let i = 0; i < total; i++) {
      if (pickRoot(root, 150, 60, rng) === 0) first++
    }
    // Weights 1 and e^-1: the best is chosen about 73% of the time.
    expect(first / total).toBeGreaterThan(0.68)
    expect(first / total).toBeLessThan(0.78)
  })
})
