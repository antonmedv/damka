import { squareName } from './board.ts'
import type { Move } from './types.ts'

/**
 * "c3-d4" for a quiet move, "c3:e5:g7" for a capture along its path, and
 * "a1-a3-c3" for an уголки jump chain: every landing square, joined the
 * way a quiet move is, since nothing is taken.
 */
export function formatMove(move: Move): string {
  const separator = move.captures.length === 0 ? '-' : ':'
  return [move.from, ...move.path].map(squareName).join(separator)
}

export type MovePair = {
  n: number
  white: Move
  black: Move | undefined
}

/** Groups the move list into numbered white/black pairs. */
export function movePairs(moves: ReadonlyArray<Move>): MovePair[] {
  const pairs: MovePair[] = []
  for (let i = 0; i < moves.length; i += 2) {
    const white = moves[i]
    if (white === undefined) break
    pairs.push({ n: i / 2 + 1, white, black: moves[i + 1] })
  }
  return pairs
}
