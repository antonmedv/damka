import { afterEach, describe, expect, it } from 'vitest'
import { MATE, MATE_BOUND, matedScore } from './score.ts'
import { initialBitPosition, parsePos } from './position.ts'
import type { BitPosition } from './position.ts'
import {
  DEFAULT_TT_BITS,
  EXACT,
  LOWER,
  UPPER,
  metaOf,
  scoreFromTT,
  scoreToTT,
  ttClear,
  ttDepth,
  ttEntries,
  ttFlag,
  ttIndex,
  ttMatches,
  ttMove0,
  ttMove1,
  ttNewGeneration,
  ttResize,
  ttScore,
  ttStore,
} from './tt.ts'
import { DRAW_PLIES } from './status.ts'
import { CHECKERS, GIVEAWAY } from './variant.ts'

const words = (p: BitPosition): [number, number, number, number] => [
  p.white,
  p.black,
  p.kings,
  metaOf(p.side, p.plies, CHECKERS),
]

const initial = initialBitPosition()
const other = parsePos('B:WKd4,a3:BKh8,b6,c7')

afterEach(() => {
  ttResize(DEFAULT_TT_BITS)
})

describe('transposition table', () => {
  /**
   * The variant rides in the meta word above the draw counter, so the two
   * have to stay out of each other's bits. Raising `DRAW_PLIES` past 31
   * would put a checkers position on top of a поддавки one and hand back
   * a score from the wrong game, which is the kind of thing that breaks
   * silently; this is the tripwire.
   */
  it('gives the two variants disjoint meta words at every legal counter', () => {
    const seen = new Map<number, number>()
    for (let plies = 0; plies <= DRAW_PLIES; plies++) {
      for (const side of [0, 1]) {
        for (const variant of [CHECKERS, GIVEAWAY]) {
          const meta = metaOf(side, plies, variant)
          expect(seen.get(meta) ?? variant).toBe(variant)
          seen.set(meta, variant)
        }
      }
    }
  })

  it('keeps the two variants apart', () => {
    const checkers: [number, number, number, number] = [
      initial.white,
      initial.black,
      initial.kings,
      metaOf(initial.side, initial.plies, CHECKERS),
    ]
    const giveaway: [number, number, number, number] = [
      initial.white,
      initial.black,
      initial.kings,
      metaOf(initial.side, initial.plies, GIVEAWAY),
    ]
    ttStore(ttIndex(...checkers), ...checkers, 7, EXACT, 42, 0x1234, 0x5678)
    // The same board, the other game: the entry must not be readable, or a
    // поддавки node would be scored by checkers rules.
    expect(ttMatches(ttIndex(...giveaway), ...giveaway)).toBe(false)
    expect(ttMatches(ttIndex(...checkers), ...checkers)).toBe(true)
  })

  it('stores an entry and finds it again', () => {
    const w = words(initial)
    const base = ttIndex(...w)
    expect(ttMatches(base, ...w)).toBe(false)
    ttStore(base, ...w, 7, EXACT, 42, 0x1234, 0x5678)
    expect(ttMatches(base, ...w)).toBe(true)
    expect(ttScore(base)).toBe(42)
    expect(ttDepth(base)).toBe(7)
    expect(ttFlag(base)).toBe(EXACT)
    expect(ttMove0(base)).toBe(0x1234)
    expect(ttMove1(base)).toBe(0x5678)
  })

  it('keeps negative scores and moves with bit 31 set intact', () => {
    const w = words(other)
    const base = ttIndex(...w)
    ttStore(base, ...w, 255, UPPER, -MATE, 0, 0x80000000 | 0)
    expect(ttScore(base)).toBe(-MATE)
    expect(ttDepth(base)).toBe(255)
    expect(ttFlag(base)).toBe(UPPER)
    expect(ttMove1(base)).toBe(0x80000000 | 0)
  })

  it('never reports another position that shares the entry', () => {
    ttResize(0)
    expect(ttEntries()).toBe(1)
    const a = words(initial)
    const b = words(other)
    expect(ttIndex(...a)).toBe(ttIndex(...b))
    ttStore(ttIndex(...a), ...a, 3, LOWER, 10, 1, 0)
    expect(ttMatches(ttIndex(...b), ...b)).toBe(false)
    expect(ttMatches(ttIndex(...a), ...a)).toBe(true)
  })

  it('treats the same board with another draw counter as another state', () => {
    ttResize(0)
    const w = words(initial)
    const later = words({ ...initial, plies: 12 })
    ttStore(ttIndex(...w), ...w, 3, EXACT, 10, 1, 0)
    expect(ttMatches(ttIndex(...later), ...later)).toBe(false)
    ttStore(ttIndex(...later), ...later, 3, EXACT, -10, 2, 0)
    expect(ttMatches(ttIndex(...later), ...later)).toBe(true)
    expect(ttMatches(ttIndex(...w), ...w)).toBe(false)
  })

  it('does not treat the empty table as a hit for an empty position', () => {
    expect(ttMatches(ttIndex(0, 0, 0, 0), 0, 0, 0, 0)).toBe(false)
  })

  it('keeps a deeper entry from the current search over a shallower one', () => {
    ttResize(0)
    const a = words(initial)
    const b = words(other)
    ttStore(ttIndex(...a), ...a, 6, EXACT, 1, 0, 0)
    ttStore(ttIndex(...b), ...b, 2, EXACT, 2, 0, 0)
    expect(ttMatches(0, ...a)).toBe(true)
    ttStore(ttIndex(...b), ...b, 6, EXACT, 2, 0, 0)
    expect(ttMatches(0, ...b)).toBe(true)
  })

  it('always refreshes the entry of the same position', () => {
    ttResize(0)
    const a = words(initial)
    ttStore(ttIndex(...a), ...a, 6, EXACT, 1, 0, 0)
    ttStore(ttIndex(...a), ...a, 2, UPPER, 5, 9, 0)
    expect(ttDepth(0)).toBe(2)
    expect(ttFlag(0)).toBe(UPPER)
    expect(ttScore(0)).toBe(5)
    expect(ttMove0(0)).toBe(9)
  })

  it('lets a new search overwrite deeper entries of the old one', () => {
    ttResize(0)
    const a = words(initial)
    const b = words(other)
    ttStore(ttIndex(...a), ...a, 6, EXACT, 1, 0, 0)
    ttNewGeneration()
    ttStore(ttIndex(...b), ...b, 1, LOWER, 2, 0, 0)
    expect(ttMatches(0, ...b)).toBe(true)
  })

  it('clears', () => {
    const w = words(initial)
    ttStore(ttIndex(...w), ...w, 1, EXACT, 0, 0, 0)
    ttClear()
    expect(ttMatches(ttIndex(...w), ...w)).toBe(false)
  })
})

describe('mate scores in the table', () => {
  it('reports the right distance from another ply', () => {
    // Seen from ply 3, a win at ply 7: four plies away.
    const found = -matedScore(7)
    const stored = scoreToTT(found, 3)
    expect(stored).toBe(MATE - 4)
    // The same node reached at ply 5 wins at ply 9.
    expect(scoreFromTT(stored, 5)).toBe(-matedScore(9))
    // And a loss the other way round.
    const loss = matedScore(7)
    expect(scoreFromTT(scoreToTT(loss, 3), 5)).toBe(matedScore(9))
  })

  it('leaves ordinary scores alone', () => {
    for (const s of [0, 100, -350, MATE_BOUND - 1, 1 - MATE_BOUND]) {
      expect(scoreToTT(s, 20)).toBe(s)
      expect(scoreFromTT(s, 20)).toBe(s)
    }
  })

  it('round-trips at the same ply', () => {
    for (let ply = 0; ply < 64; ply++) {
      for (const s of [MATE - 10, 10 - MATE, MATE_BOUND, -MATE_BOUND]) {
        expect(scoreFromTT(scoreToTT(s, ply), ply)).toBe(s)
      }
    }
  })
})
