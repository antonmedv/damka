import { APPLIED, makeMove } from './apply.ts'
import { MAX_MOVES, MOVE_SLOTS, generate } from './movegen.ts'

export const MAX_DEPTH = 64

/** One move-list region per depth 1..MAX_DEPTH, so recursion never overwrites a list. */
const STACK = new Int32Array(MAX_DEPTH * MAX_MOVES * MOVE_SLOTS)

/**
 * Number of leaf nodes `depth` plies down (0 <= depth <= MAX_DEPTH); the
 * draw rule is ignored, and a side without moves is a leaf. Same shape as
 * the future search loop.
 */
export function perft(
  white: number,
  black: number,
  kings: number,
  side: number,
  depth: number,
): number {
  if (depth === 0) return 1
  const base = (depth - 1) * MAX_MOVES * MOVE_SLOTS
  const count = generate(white, black, kings, side, STACK, base)
  if (depth === 1) return count
  let nodes = 0
  const end = base + count * MOVE_SLOTS
  for (let i = base; i < end; i += MOVE_SLOTS) {
    makeMove(white, black, kings, side, 0, STACK[i]!, STACK[i + 1]!)
    nodes += perft(APPLIED[0]!, APPLIED[1]!, APPLIED[2]!, side ^ 1, depth - 1)
  }
  return nodes
}
