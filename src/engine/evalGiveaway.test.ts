import { afterEach, describe, expect, it } from 'vitest'
import { popcount, squareFromName32 } from './bitboard.ts'
import { EVAL_MAX, evaluate, pieceSquareSum } from './eval.ts'
import {
  DEFAULT_WEIGHTS,
  MAN_TABLE,
  baselineEval,
  currentWeights,
  evaluateGiveaway,
  weights,
} from './evalGiveaway.ts'
import {
  BLACK,
  WHITE,
  initialBitPosition,
  mirror,
  parsePos,
} from './position.ts'
import type { BitPosition } from './position.ts'
import { createRng, randomPlacement, randomWalk } from './random.ts'

const sq = squareFromName32
const { man: MAN, king: KING, tempo: TEMPO } = DEFAULT_WEIGHTS

function score(p: BitPosition): number {
  return evaluateGiveaway(p.white, p.black, p.kings, p.side)
}

/** Square by square, no lookups: what `evaluateGiveaway` must compute. */
function reference(p: BitPosition): number {
  const { king } = currentWeights()
  let score = 0
  for (let sq = 0; sq < 32; sq++) {
    const b = 1 << sq
    const isKing = (p.kings & b) !== 0
    // A burden counts against whoever is carrying it.
    if ((p.white & b) !== 0) score -= isKing ? king : MAN_TABLE[sq]!
    if ((p.black & b) !== 0) score += isKing ? king : MAN_TABLE[31 - sq]!
  }
  return (p.side === WHITE ? score : -score) + currentWeights().tempo
}

function samples(): BitPosition[] {
  const rng = createRng(7)
  const positions = randomWalk(rng, 300)
  while (positions.length < 600) positions.push(randomPlacement(rng))
  return positions
}

afterEach(() => {
  baselineEval(false)
  weights()
})

describe('evaluateGiveaway', () => {
  it('matches the square-by-square reference on random positions', () => {
    for (const p of samples()) expect(score(p)).toBe(reference(p))
  })

  it('sees the same game from either side of the board', () => {
    for (const p of samples()) expect(score(mirror(p))).toBe(score(p))
  })

  it('gives the two sides opposite scores apart from tempo', () => {
    for (const p of samples()) {
      const white = evaluateGiveaway(p.white, p.black, p.kings, WHITE)
      const black = evaluateGiveaway(p.white, p.black, p.kings, BLACK)
      expect(white + black).toBe(2 * TEMPO)
    }
  })

  it('finds the initial position level', () => {
    expect(score(initialBitPosition())).toBe(TEMPO)
  })

  it('prefers to be carrying less than the opponent', () => {
    const both = score(parsePos('W:Wc3,e3:Bd6,f6'))
    const lighter = score(parsePos('W:Wc3:Bd6,f6'))
    expect(lighter).toBeGreaterThan(both)
  })

  /**
   * A king survives the exchanges that clear men away and is dragged into
   * the sequences that empty the other side, so it is the piece hardest to
   * be rid of — by more than the three men checkers values it at, which is
   * what self-play settled on.
   */
  it('reads a king as much the heavier burden', () => {
    expect(KING).toBeGreaterThan(3 * MAN)
    const withMan = score(parsePos('W:Wc3:Bd6'))
    const withKing = score(parsePos('W:WKc3:Bd6'))
    expect(withKing).toBeLessThan(withMan)
  })

  it('counts a king the same wherever it stands', () => {
    const corner = score(parsePos('W:WKa1:Bd6'))
    const middle = score(parsePos('W:WKd4:Bd6'))
    expect(corner).toBe(middle)
  })

  it('counts the risk of promotion against the man running at it', () => {
    expect(MAN_TABLE[sq('c7')]!).toBeGreaterThan(MAN_TABLE[sq('c5')]!)
    expect(MAN_TABLE[sq('c5')]!).toBeGreaterThan(MAN_TABLE[sq('c3')]!)
  })

  it('sums the man table like the lookups', () => {
    const rng = createRng(11)
    for (let i = 0; i < 200; i++) {
      const b = (rng() * 4294967296) | 0
      const slow = pieceSquareSum(b, MAN_TABLE)
      let loop = 0
      for (let s = 0; s < 32; s++) {
        if (((b >>> s) & 1) !== 0) loop += MAN_TABLE[s]!
      }
      expect(slow).toBe(loop)
    }
  })

  it('stays strictly inside EVAL_MAX', () => {
    const worst = Math.max(KING, ...MAN_TABLE)
    expect(12 * worst + TEMPO).toBeLessThan(EVAL_MAX)
    for (const p of samples()) expect(Math.abs(score(p))).toBeLessThan(EVAL_MAX)
  })

  it('rebuilds its table when the weights are replaced', () => {
    const before = MAN_TABLE[sq('c3')]!
    weights({ ...DEFAULT_WEIGHTS, man: MAN + 40 })
    expect(MAN_TABLE[sq('c3')]!).toBe(before + 40)
    // The lookups must follow the table, not a copy taken at start-up.
    const p = parsePos('W:Wc3:B')
    expect(score(p)).toBe(reference(p))
    weights()
    expect(MAN_TABLE[sq('c3')]!).toBe(before)
  })

  it('counts kings by popcount, not by table', () => {
    // Four kings a side: the burdens cancel, whatever the king weight.
    const p = parsePos('W:WKa1,Kc1,Ke1,Kg1:BKb8,Kd8,Kf8,Kh8')
    expect(popcount(p.kings)).toBe(8)
    expect(score(p)).toBe(TEMPO)
  })

  it('falls back to the negated checkers evaluation for measurement', () => {
    const p = parsePos('W:Wc3,e3:Bd6,f6')
    baselineEval(true)
    expect(score(p)).toBe(0 - evaluate(p.white, p.black, p.kings, p.side))
    baselineEval(false)
    expect(score(p)).toBe(reference(p))
  })
})
