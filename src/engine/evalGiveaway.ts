/**
 * Static evaluation for поддавки, version 1: material read as a burden
 * rather than a value, returned from the point of view of the side to
 * move (negamax convention).
 *
 * The checkers evaluation cannot simply be negated. Advancement, the
 * back-rank guard and the main-road king bonus each encode a piece of
 * checkers reasoning, and the inverse of that reasoning is not the
 * поддавки reasoning: "keep your men on the back rank" is not the mirror
 * of "men on the back rank are hard to give away", it only happens to
 * have the opposite sign. So the terms are written again from the other
 * game's point of view.
 *
 * A burden is how much trouble a piece is to its owner, and a position is
 * good for you when the other side is carrying more than you are - so the
 * two sums are subtracted the other way round from `eval.ts`. Terms:
 *
 * - material: a man is 100, a king 400. The king is much the heavier
 *   burden, and heavier than the three men checkers values it at: it
 *   survives the exchanges that clear men off the board, it is dragged
 *   into the capture sequences that empty everyone else's side, and it
 *   cannot be given away by the simple means of walking into a jump. How
 *   much heavier was the one thing self-play had a firm opinion about;
 * - promotion: a man near the far rank is about to be saddled with a
 *   king, so its burden rises with its rank. Folded into `MAN_TABLE`;
 * - tempo: a small bonus for the side to move.
 *
 * Tried and dropped: a burden for pieces on the border. It rests on a
 * fact, and a true one - a piece on file a, file h, rank 1 or rank 8
 * cannot be captured at all, because every capture lands on a square
 * beyond the piece taken and beyond the border there is no board, which
 * `movegen.test.ts` asserts against the generator - and it still measured
 * worse than leaving it out. Safety cuts both ways here: a piece the
 * other side cannot take is also a piece they cannot be made to take.
 *
 * The weights come from `npm run selfplay` against the negated checkers
 * evaluation, which is a stronger baseline than it sounds: it already
 * values a king at three men and already wants men to stay back. This set
 * beats it 57% over 400 games on a seed it was not chosen on - 61% on the
 * seed it was, which is the selection showing and not the number to
 * quote. See `baselineEval`, `weights`, and `tasks/todo.md` for the runs.
 *
 * Men go through the same two 16-bit lookups as `eval.ts`; kings are a
 * flat weight, so they need only a popcount.
 */
import { lsb, popcount, reverse32 } from './bitboard.ts'
import { evaluate } from './eval.ts'
import { WHITE } from './position.ts'

/**
 * What a piece costs its owner. These four numbers are the whole of the
 * evaluation; `weights` replaces them and rebuilds the table, which is how
 * self-play searched for the set below.
 */
export type Weights = {
  /** Burden of owning a man, before the square it stands on. */
  readonly man: number
  /** Burden of owning a king, wherever it stands. */
  readonly king: number
  /**
   * Multiplies the rank term: positive makes running at the far rank a
   * risk, negative makes it something to want, zero drops it.
   */
  readonly promotion: number
  /**
   * For the side to move. The sign looked like a real question rather
   * than a damping device - поддавки is won by running out of moves, so
   * having the move is not obviously the good news it is at checkers -
   * and self-play answered it: a negative tempo is measurably worse, a
   * positive one is not distinguishable from none. The checkers sign,
   * then, and the size hardly matters. See `tasks/todo.md` for the runs.
   */
  readonly tempo: number
}

export const DEFAULT_WEIGHTS: Weights = {
  man: 100,
  king: 400,
  promotion: 1,
  tempo: 5,
}

/** Shape of the rank term, scaled by `Weights.promotion`. */
const RANK_SHAPE = [0, 1, 2, 3, 5, 8, 12, 0]

/** Burden of a white man on each square, material included. */
export let MAN_TABLE: Int32Array

let MAN_LO: Int32Array
let MAN_HI: Int32Array
let current: Weights = DEFAULT_WEIGHTS
/* Pulled out of `current` so the leaf reads two numbers, not two fields
 * off an object that `weights` replaces. */
let kingWeight = DEFAULT_WEIGHTS.king
let tempoWeight = DEFAULT_WEIGHTS.tempo

/**
 * Replaces the weights and rebuilds the table. Measurement only, the way
 * `dbLimit` is; a game never calls it.
 */
export function weights(next: Weights = DEFAULT_WEIGHTS): void {
  current = next
  kingWeight = next.king
  tempoWeight = next.tempo
  MAN_TABLE = table(
    (sq) => next.man + Math.round(RANK_SHAPE[sq >> 2]! * next.promotion),
  )
  MAN_LO = half(MAN_TABLE, 0)
  MAN_HI = half(MAN_TABLE, 16)
}

export function currentWeights(): Weights {
  return current
}

weights()

/**
 * Whether the search is using the baseline evaluation instead of this
 * one. Measurement only, again: `npm run selfplay` turns it on for one
 * side of a pairing to see what the weights above are worth against the
 * negated checkers evaluation they replaced. A game never touches it.
 */
let baseline = false

export function baselineEval(on: boolean): void {
  baseline = on
}

/**
 * Score for the side to move. Takes the position as the search holds it:
 * both colours' kings in one bitboard, `side` 0 for White.
 */
export function evaluateGiveaway(
  white: number,
  black: number,
  kings: number,
  side: number,
): number {
  // `0 - x`, not `-x`: negating a zero score would give -0, a heap number.
  if (baseline) return 0 - evaluate(white, black, kings, side)
  const whiteMen = white & ~kings
  // Black seen from its own side of the board, so White's table applies.
  const blackMen = reverse32(black & ~kings)
  // The other side's burden less your own: what you want is to be the
  // lighter of the two.
  const score =
    MAN_LO[blackMen & 0xffff]! +
    MAN_HI[blackMen >>> 16]! -
    MAN_LO[whiteMen & 0xffff]! -
    MAN_HI[whiteMen >>> 16]! +
    (popcount(black & kings) - popcount(white & kings)) * kingWeight
  return (side === WHITE ? score : -score) + tempoWeight
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
