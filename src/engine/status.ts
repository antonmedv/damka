import { MAX_MOVES, MOVE_SLOTS, generate } from './movegen.ts'
import { WHITE } from './position.ts'
import { GIVEAWAY } from './variant.ts'
import type { Variant } from './variant.ts'

export const ONGOING = 0
export const WHITE_WINS = 1
export const BLACK_WINS = 2
export const DRAW = 3

/** RULES.md: a draw after this many consecutive quiet king plies. */
export const DRAW_PLIES = 30

const SCRATCH = new Int32Array(MAX_MOVES * MOVE_SLOTS)

/**
 * Game state before `side` moves, given its number of legal moves. A side
 * with no legal move (which includes having no pieces) has lost at
 * checkers and won at поддавки - the one rule the two games disagree on.
 * Either way it is decided before the draw rule, as in the Go engine: the
 * move that leaves the opponent without a reply settles the game even when
 * it is the 30th quiet king ply. The search calls this with the count it
 * has just generated.
 *
 * `variant` has no default on purpose. A default here would let a game of
 * поддавки be scored by checkers rules from any call site that forgot it,
 * which is the worst bug this code can have and the hardest to notice.
 */
export function statusOf(
  moveCount: number,
  side: number,
  plies: number,
  variant: Variant,
): number {
  if (moveCount === 0) {
    const winner = variant === GIVEAWAY ? side : side ^ 1
    return winner === WHITE ? WHITE_WINS : BLACK_WINS
  }
  if (plies >= DRAW_PLIES) return DRAW
  return ONGOING
}

/** `statusOf` for callers that have not generated moves yet (UI boundary). */
export function status(
  white: number,
  black: number,
  kings: number,
  side: number,
  plies: number,
  variant: Variant,
): number {
  return statusOf(
    generate(white, black, kings, side, SCRATCH, 0),
    side,
    plies,
    variant,
  )
}
