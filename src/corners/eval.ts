/**
 * Static evaluation for уголки, from the point of view of the side to
 * move (negamax convention). A race is measured in distance, so every man
 * carries a cost by square and a side is ahead by the cost it has shed:
 *
 * - outside the target, `step` per square of Manhattan distance to the
 *   nearest target square, on top of the dearest square inside, so that
 *   entering is worth exactly one more step;
 * - inside the target, `inside` per square from the far corner: the back
 *   fills first and the entrance stays clear for the men behind;
 * - the straggler: the side's most expensive man counted again, by
 *   `straggler` percent. Races are lost by the man left behind, and a
 *   sum alone is content to move the leaders;
 * - tempo, the usual damping of the odd/even swing between iterations.
 *
 * The weights were measured by `npm run selfplay`, one change at a time
 * against a first set over a hundred games or more; the runs are in
 * `tasks/todo-corners.md`. The inside term is the spine of the evaluation
 * (80% against none, and 20 beat the first guess of 10 by 55% over 300
 * games), the straggler earns its place (70% against none) and sits on a
 * plateau from 50 to 100, and tempo is even to the game. `weights`
 * replaces them for a run, which is how the sets were compared.
 * The cost tables are rebuilt from `TARGET_DISTANCE` and `CORNER_DISTANCE`
 * in `board.ts`; `EVAL_MAX` bounds the sum for the mate band's sake and
 * the tests check it against the worst position there is.
 */
import {
  BLACK_MAN,
  BOARD,
  CORNER_DISTANCE,
  EMPTY,
  HOME_SIZE,
  MEN,
  TARGET_DISTANCE,
  WHITE,
  WHITE_MAN,
} from './board.ts'

export type Weights = {
  /** Per square still to walk, outside the target. */
  readonly step: number
  /** Per square from the far corner, inside the target. */
  readonly inside: number
  /** Percent of the dearest man's cost, added again. */
  readonly straggler: number
  /** For the side to move. */
  readonly tempo: number
}

export const DEFAULT_WEIGHTS: Weights = {
  step: 100,
  inside: 20,
  straggler: 50,
  tempo: 5,
}

/**
 * Every evaluation lies strictly inside ±EVAL_MAX, so scores beyond it are
 * free for mate distances: nine men at the far corner of the board with
 * the straggler on top stay under it, which the tests check.
 */
export const EVAL_MAX = 20000

/** `COST[side * 64 + sq]`: what a man of `side` on `sq` costs its owner. */
export const COST = new Int32Array(128)

let current: Weights = DEFAULT_WEIGHTS

/**
 * Replaces the weights and rebuilds the cost tables. Refuses a weight that
 * is not a number — a typo in a self-play argument, which the int tables
 * would store as zero — and a set whose worst position would reach the
 * mate band: a self-play run on either would measure nothing.
 */
export function weights(next: Weights): void {
  for (const [name, value] of Object.entries(next)) {
    if (!Number.isFinite(value)) throw new Error(`weight ${name} is ${value}`)
  }
  const deepest = next.inside * 2 * (HOME_SIZE - 1)
  let dearest = 0
  for (let side = 0; side < 2; side++) {
    for (let sq = 0; sq < 64; sq++) {
      const at = side * 64 + sq
      const outside = TARGET_DISTANCE[at]!
      const cost =
        outside === 0
          ? next.inside * CORNER_DISTANCE[at]!
          : next.step * outside + deepest
      COST[at] = cost
      if (cost > dearest) dearest = cost
    }
  }
  const worst =
    MEN * dearest + (dearest * next.straggler) / 100 + Math.abs(next.tempo)
  if (worst >= EVAL_MAX) {
    weights(current)
    throw new Error(
      `weights reach ${worst}, the mate band starts at ${EVAL_MAX}`,
    )
  }
  current = next
}

export function currentWeights(): Weights {
  return current
}

weights(DEFAULT_WEIGHTS)

/** Score for `side`, to move, on the loaded board. */
export function evaluate(side: number): number {
  let whiteCost = 0
  let blackCost = 0
  let whiteWorst = 0
  let blackWorst = 0
  for (let sq = 0; sq < 64; sq++) {
    const cell = BOARD[sq]
    if (cell === EMPTY) continue
    if (cell === WHITE_MAN) {
      const cost = COST[sq]!
      whiteCost += cost
      if (cost > whiteWorst) whiteWorst = cost
    } else if (cell === BLACK_MAN) {
      const cost = COST[64 + sq]!
      blackCost += cost
      if (cost > blackWorst) blackWorst = cost
    }
  }
  const straggler = ((blackWorst - whiteWorst) * current.straggler) / 100
  const score = blackCost - whiteCost + (straggler | 0)
  return (side === WHITE ? score : -score) + current.tempo
}
