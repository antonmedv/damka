import { describe, expect, it } from 'vitest'
import { RANK_1, RANK_8, popcount, squareFromName32 } from './bitboard.ts'
import {
  BACK_RANK_GUARD,
  EVAL_MAX,
  KING_TABLE,
  KING_VALUE,
  MAN_TABLE,
  MAN_VALUE,
  TEMPO,
  evaluate,
  pieceSquareSum,
} from './eval.ts'
import {
  BLACK,
  WHITE,
  initialBitPosition,
  mirror,
  parsePos,
} from './position.ts'
import type { BitPosition } from './position.ts'
import { createRng, randomPlacement, randomWalk } from './random.ts'

function score(p: BitPosition): number {
  return evaluate(p.white, p.black, p.kings, p.side)
}

/** Square by square, no lookups: what `evaluate` must compute. */
function reference(p: BitPosition): number {
  let score = 0
  for (let sq = 0; sq < 32; sq++) {
    const b = 1 << sq
    const king = (p.kings & b) !== 0
    if ((p.white & b) !== 0) {
      score += king ? KING_TABLE[sq]! : MAN_TABLE[sq]!
    }
    if ((p.black & b) !== 0) {
      score -= king ? KING_TABLE[31 - sq]! : MAN_TABLE[31 - sq]!
    }
  }
  const whiteMen = p.white & ~p.kings
  const blackMen = p.black & ~p.kings
  if (blackMen !== 0) score += popcount(whiteMen & RANK_1) * BACK_RANK_GUARD
  if (whiteMen !== 0) score -= popcount(blackMen & RANK_8) * BACK_RANK_GUARD
  return (p.side === WHITE ? score : -score) + TEMPO
}

function samples(): BitPosition[] {
  const rng = createRng(7)
  const positions = randomWalk(rng, 300)
  while (positions.length < 600) positions.push(randomPlacement(rng))
  return positions
}

const sq = squareFromName32

describe('evaluate', () => {
  it('matches the square-by-square reference on random positions', () => {
    for (const p of samples()) expect(score(p)).toBe(reference(p))
  })

  it('sees the same game from either side of the board', () => {
    for (const p of samples()) expect(score(mirror(p))).toBe(score(p))
  })

  it('gives the two sides opposite scores apart from tempo', () => {
    for (const p of samples()) {
      const white = evaluate(p.white, p.black, p.kings, WHITE)
      const black = evaluate(p.white, p.black, p.kings, BLACK)
      expect(white + black).toBe(2 * TEMPO)
    }
  })

  it('finds the initial position level', () => {
    expect(score(initialBitPosition())).toBe(TEMPO)
  })

  it('values a king above a man and a man above nothing', () => {
    expect(score(parsePos('W:Wd4:B'))).toBeGreaterThan(MAN_VALUE)
    expect(score(parsePos('W:WKd4:B'))).toBeGreaterThan(KING_VALUE)
    expect(score(parsePos('W:WKd4:Bd6'))).toBeGreaterThan(0)
    expect(score(parsePos('W:Wd4:BKd6'))).toBeLessThan(0)
  })

  it('lets men gain value as they advance', () => {
    const aFile = ['a1', 'a3', 'a5', 'a7'].map((n) => MAN_TABLE[sq(n)]!)
    const hFile = ['h2', 'h4', 'h6'].map((n) => MAN_TABLE[sq(n)]!)
    for (const file of [aFile, hFile]) {
      for (let i = 1; i < file.length; i++) {
        expect(file[i]).toBeGreaterThan(file[i - 1]!)
      }
    }
  })

  it('prefers the main road for kings', () => {
    const main = KING_TABLE[sq('d4')]!
    const double = KING_TABLE[sq('f4')]!
    const triple = KING_TABLE[sq('h4')]!
    const short = KING_TABLE[sq('h2')]!
    expect(main).toBeGreaterThan(double)
    expect(double).toBeGreaterThan(triple)
    expect(triple).toBeGreaterThan(short)
  })

  it('guards the back rank only while the opponent has men', () => {
    const step = MAN_TABLE[sq('b2')]! - MAN_TABLE[sq('c1')]!
    const againstMan =
      score(parsePos('W:Wc1:Bb6')) - score(parsePos('W:Wb2:Bb6'))
    const againstKing =
      score(parsePos('W:Wc1:BKb6')) - score(parsePos('W:Wb2:BKb6'))
    expect(againstMan).toBe(BACK_RANK_GUARD - step)
    expect(againstKing).toBe(-step)
  })

  it('sums piece-square tables like the lookups', () => {
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
    const best = Math.max(...KING_TABLE, ...MAN_TABLE)
    expect(12 * best + 4 * BACK_RANK_GUARD + TEMPO).toBeLessThan(EVAL_MAX)
    for (const p of samples()) expect(Math.abs(score(p))).toBeLessThan(EVAL_MAX)
  })
})
