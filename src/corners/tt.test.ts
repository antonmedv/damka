import { beforeEach, describe, expect, it } from 'vitest'
import { MATE } from '../engine/score.ts'
import { load } from './board.ts'
import { parseCorners } from './position.ts'
import {
  EXACT,
  LOWER,
  UPPER,
  metaOf,
  scoreFromTT,
  scoreToTT,
  ttClear,
  ttDepth,
  ttFlag,
  ttIndex,
  ttMatches,
  ttMove,
  ttNewGeneration,
  ttScore,
  ttStore,
} from './tt.ts'

beforeEach(() => {
  ttClear()
})

describe('transposition table', () => {
  it('finds nothing in an empty table', () => {
    load(parseCorners('W:Wa1:Bh8'))
    const meta = metaOf(0, 0)
    expect(ttMatches(ttIndex(meta), meta)).toBe(false)
  })

  it('returns what was stored for the same position', () => {
    load(parseCorners('W:Wa1,d4:Bh8'))
    const meta = metaOf(0, 12)
    const base = ttIndex(meta)
    ttStore(base, meta, 5, EXACT, 123, 77)
    expect(ttMatches(base, meta)).toBe(true)
    expect(ttScore(base)).toBe(123)
    expect(ttDepth(base)).toBe(5)
    expect(ttFlag(base)).toBe(EXACT)
    expect(ttMove(base)).toBe(77)
  })

  it('keeps the same board at different ply counts apart', () => {
    load(parseCorners('W:Wa1,d4:Bh8'))
    const early = metaOf(0, 12)
    ttStore(ttIndex(early), early, 5, EXACT, 123, 77)
    const late = metaOf(0, 13)
    expect(ttMatches(ttIndex(late), late)).toBe(false)
    const otherSide = metaOf(1, 12)
    expect(ttMatches(ttIndex(otherSide), otherSide)).toBe(false)
  })

  it('never matches another position at the same slot', () => {
    load(parseCorners('W:Wa1:Bh8'))
    const meta = metaOf(0, 0)
    const base = ttIndex(meta)
    ttStore(base, meta, 3, LOWER, 10, 1)
    load(parseCorners('W:Wb1:Bh8'))
    expect(ttMatches(base, meta)).toBe(false)
  })

  it('keeps a deeper entry of this search over a shallower other position', () => {
    load(parseCorners('W:Wa1:Bh8'))
    const meta = metaOf(0, 0)
    const base = ttIndex(meta)
    ttNewGeneration()
    ttStore(base, meta, 8, EXACT, 50, 3)
    load(parseCorners('W:Wc1:Bh8'))
    ttStore(base, meta, 2, UPPER, -5, 4)
    load(parseCorners('W:Wa1:Bh8'))
    expect(ttMatches(base, meta)).toBe(true)
    expect(ttDepth(base)).toBe(8)
    // A new generation lets the shallow one in.
    ttNewGeneration()
    load(parseCorners('W:Wc1:Bh8'))
    ttStore(base, meta, 2, UPPER, -5, 4)
    expect(ttMatches(base, meta)).toBe(true)
    expect(ttDepth(base)).toBe(2)
  })

  it('moves mate scores between root and node', () => {
    expect(scoreToTT(MATE - 7, 3)).toBe(MATE - 4)
    expect(scoreFromTT(MATE - 4, 3)).toBe(MATE - 7)
    expect(scoreToTT(-(MATE - 7), 3)).toBe(-(MATE - 4))
    expect(scoreFromTT(-(MATE - 4), 3)).toBe(-(MATE - 7))
    expect(scoreToTT(120, 9)).toBe(120)
  })
})
