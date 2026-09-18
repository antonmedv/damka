/**
 * Which game is being played.
 *
 * The two variants share the board, the pieces, the moves and the
 * captures - one move generator serves both. They differ in one rule,
 * which side a position with no legal move belongs to (`status.ts`), and
 * in what a position is worth (`eval.ts` against `evalGiveaway.ts`).
 *
 * An int rather than a string: it travels through the search's hot path
 * and into the transposition table's meta word. The layers above spell it
 * out as `GameVariant` and convert once at the boundary, the way a
 * `Color` becomes `WHITE` or `BLACK`.
 */
export const CHECKERS = 0
export const GIVEAWAY = 1

export type Variant = typeof CHECKERS | typeof GIVEAWAY
