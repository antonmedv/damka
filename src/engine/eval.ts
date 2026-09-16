/**
 * Static evaluation, version 1: material and piece-square tables, returned
 * from the point of view of the side to move (negamax convention).
 *
 * Tables are written for White; Black's pieces are mirrored with
 * `reverse32` so one set of tables serves both colours. Terms:
 *
 * - material: a man is 100, a king 300 (the flying king dominates open
 *   boards; three men is the usual exchange rate);
 * - men: a mild advancement bonus by rank and a centre bonus, both folded
 *   into `MAN_TABLE`;
 * - kings: a bonus for the main road a1–h8 and the double and triple
 *   roads, folded into `KING_TABLE`;
 * - back-rank guard: per man on the own back rank while the opponent still
 *   has men to promote;
 * - tempo: a small bonus for the side to move.
 *
 * The weights are guesses until self-play tuning; nothing here depends on
 * the persona. The piece-square sum of a bitboard is two 16-bit lookups
 * (`LO[b & 0xffff] + HI[b >>> 16]`) into tables filled at start-up.
 */
import {
  RANK_1,
  bit,
  lsb,
  popcount,
  reverse32,
  squareFromName32,
} from './bitboard.ts'
import { WHITE } from './position.ts'

export const MAN_VALUE = 100
export const KING_VALUE = 300
/** Per man on the own back rank while the opponent still has men. */
export const BACK_RANK_GUARD = 8
/** For the side to move; damps the odd/even swing between iterations. */
export const TEMPO = 5
/**
 * Every evaluation lies strictly inside ±EVAL_MAX (checked in the tests
 * against the largest possible material), so scores beyond it are free
 * for mate distances.
 */
export const EVAL_MAX = 20000

/** Advancement bonus by rank from the own back rank; a man never stands on rank 8. */
const ADVANCE = [0, 2, 4, 7, 10, 14, 20, 0]
const CENTRE_INNER = squares('d4 f4 c5 e5')
const CENTRE_OUTER = squares('c3 e3 d6 f6')
const MAIN_ROAD = squares('a1 b2 c3 d4 e5 f6 g7 h8')
const DOUBLE_ROAD = squares('c1 d2 e3 f4 g5 h6 a3 b4 c5 d6 e7 f8')
const TRIPLE_ROAD = squares('e1 f2 g3 h4 a5 b6 c7 d8')

/** Value of a white man on each square, material included. */
export const MAN_TABLE: Int32Array = table(
  (sq) =>
    MAN_VALUE +
    ADVANCE[sq >> 2]! +
    (has(CENTRE_INNER, sq) ? 6 : has(CENTRE_OUTER, sq) ? 3 : 0),
)

/** Value of a white king on each square, material included. */
export const KING_TABLE: Int32Array = table(
  (sq) =>
    KING_VALUE +
    (has(MAIN_ROAD, sq)
      ? 12
      : has(DOUBLE_ROAD, sq)
        ? 6
        : has(TRIPLE_ROAD, sq)
          ? 2
          : 0),
)

const MAN_LO = half(MAN_TABLE, 0)
const MAN_HI = half(MAN_TABLE, 16)
const KING_LO = half(KING_TABLE, 0)
const KING_HI = half(KING_TABLE, 16)

/**
 * Score for the side to move. Takes the position as the search holds it:
 * both colours' kings in one bitboard, `side` 0 for White.
 */
export function evaluate(
  white: number,
  black: number,
  kings: number,
  side: number,
): number {
  const whiteMen = white & ~kings
  const whiteKings = white & kings
  // Black seen from its own side of the board, so White's tables apply.
  const blackMen = reverse32(black & ~kings)
  const blackKings = reverse32(black & kings)
  let score =
    MAN_LO[whiteMen & 0xffff]! +
    MAN_HI[whiteMen >>> 16]! +
    KING_LO[whiteKings & 0xffff]! +
    KING_HI[whiteKings >>> 16]! -
    MAN_LO[blackMen & 0xffff]! -
    MAN_HI[blackMen >>> 16]! -
    KING_LO[blackKings & 0xffff]! -
    KING_HI[blackKings >>> 16]!
  if (blackMen !== 0) score += popcount(whiteMen & RANK_1) * BACK_RANK_GUARD
  if (whiteMen !== 0) score -= popcount(blackMen & RANK_1) * BACK_RANK_GUARD
  return (side === WHITE ? score : -score) + TEMPO
}

/** Sum of `table` over the set bits of `b`; the slow reference for the lookups. */
export function pieceSquareSum(b: number, table: Int32Array): number {
  let sum = 0
  for (let rest = b; rest !== 0; rest &= rest - 1) sum += table[lsb(rest)]!
  return sum
}

function squares(names: string): number {
  let mask = 0
  for (const name of names.split(' ')) mask |= bit(squareFromName32(name))
  return mask
}

function has(mask: number, sq: number): boolean {
  return (mask & bit(sq)) !== 0
}

function table(value: (sq: number) => number): Int32Array {
  const t = new Int32Array(32)
  for (let sq = 0; sq < 32; sq++) t[sq] = value(sq)
  return t
}

/**
 * Lookup for one 16-bit half of a bitboard: entry `v` is the table sum
 * over the bits of `v`, built from the entry with the lowest bit cleared.
 */
function half(table: Int32Array, offset: number): Int32Array {
  const lut = new Int32Array(65536)
  for (let v = 1; v < 65536; v++) {
    lut[v] = lut[v & (v - 1)]! + table[offset + lsb(v)]!
  }
  return lut
}
