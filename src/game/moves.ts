import { generateDetailed as cornersMoves } from '../corners/movegen.ts'
import { status as cornersStatus } from '../corners/status.ts'
import { toBitPosition, toVariant } from '../engine/adapter.ts'
import { generateDetailed } from '../engine/movegen.ts'
import { BLACK, WHITE } from '../engine/position.ts'
import { BLACK_WINS, DRAW, WHITE_WINS, statusOf } from '../engine/status.ts'
import type {
  GameStatus,
  GameVariant,
  Move,
  Position,
  Square,
} from './types.ts'

/**
 * Positions are immutable, so their move lists can be cached by identity.
 * A position belongs to one game, but nothing enforces that, so the entry
 * remembers which game generated it and is redone for another.
 */
type Cached = {
  readonly variant: GameVariant
  readonly moves: ReadonlyArray<Move>
}

const cache = new WeakMap<Position, Cached>()

/**
 * Every legal move for the side to move under the rules of `variant`. At
 * checkers and поддавки one entry per capture path, and only captures
 * when any exist, since they are mandatory; at уголки one entry per
 * destination. `variant` has no default, for the reason `statusOf` gives.
 */
export function legalMoves(
  position: Position,
  variant: GameVariant,
): ReadonlyArray<Move> {
  const cached = cache.get(position)
  if (cached !== undefined && cached.variant === variant) return cached.moves
  const moves =
    variant === 'corners'
      ? cornersMoves(position)
      : generateDetailed(toBitPosition(position))
  cache.set(position, { variant, moves })
  return moves
}

/** Legal moves of the piece on `from`; empty for other squares. */
export function movesFrom(
  position: Position,
  from: Square,
  variant: GameVariant,
): Move[] {
  return legalMoves(position, variant).filter((move) => move.from === from)
}

/** Squares holding a piece that has at least one legal move. */
export function movablePieces(
  position: Position,
  variant: GameVariant,
): Square[] {
  return [...new Set(legalMoves(position, variant).map((move) => move.from))]
}

/**
 * How the game stands before the side to move moves. At checkers a side
 * with no legal move (or no pieces) has lost, at поддавки it has won, and
 * otherwise the game is drawn once the counter reaches the limit; at
 * уголки the race and the blocking rules decide (`corners/status.ts`).
 * The engines decide the order; this only maps their result.
 */
export function gameStatus(
  position: Position,
  variant: GameVariant,
): GameStatus {
  const moveCount = legalMoves(position, variant).length
  const side = position.toMove === 'white' ? WHITE : BLACK
  const result =
    variant === 'corners'
      ? cornersStatus(position, moveCount)
      : statusOf(moveCount, side, position.drawCounter, toVariant(variant))
  switch (result) {
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
