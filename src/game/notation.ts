import { squareName } from './board.ts'
import type { Move } from './types.ts'

/** "c3-d4" for a quiet move, "c3:e5:g7" for a capture along its path. */
export function formatMove(move: Move): string {
  if (move.captures.length === 0) {
    return `${squareName(move.from)}-${squareName(move.to)}`
  }
  return [move.from, ...move.path].map(squareName).join(':')
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
