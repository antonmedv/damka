import { toBitPosition } from '../engine/adapter.ts'
import { generateDetailed } from '../engine/movegen.ts'
import { BLACK, WHITE } from '../engine/position.ts'
import { BLACK_WINS, DRAW, WHITE_WINS, statusOf } from '../engine/status.ts'
import type { GameStatus, Move, Position, Square } from './types.ts'

/** Positions are immutable, so their move lists can be cached by identity. */
const cache = new WeakMap<Position, ReadonlyArray<Move>>()

/**
 * Every legal move for the side to move, one entry per capture path.
 * Captures are mandatory: when any exist, only captures are returned.
 */
export function legalMoves(position: Position): ReadonlyArray<Move> {
  let moves = cache.get(position)
  if (moves === undefined) {
    moves = generateDetailed(toBitPosition(position))
    cache.set(position, moves)
  }
  return moves
}

/** Legal moves of the piece on `from`; empty for other squares. */
export function movesFrom(position: Position, from: Square): Move[] {
  return legalMoves(position).filter((move) => move.from === from)
}

/** Squares holding a piece that has at least one legal move. */
export function movablePieces(position: Position): Square[] {
  return [...new Set(legalMoves(position).map((move) => move.from))]
}

/**
 * A side with no legal move (or no pieces) has lost; otherwise the game is
 * drawn once the counter reaches the limit. The engine decides the order;
 * this only maps its result.
 */
export function gameStatus(position: Position): GameStatus {
  const side = position.toMove === 'white' ? WHITE : BLACK
  const moveCount = legalMoves(position).length
  switch (statusOf(moveCount, side, position.drawCounter)) {
    case WHITE_WINS:
      return 'whiteWins'
    case BLACK_WINS:
      return 'blackWins'
    case DRAW:
      return 'draw'
    default:
      return 'ongoing'
  }
}
