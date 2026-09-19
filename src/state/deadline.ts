/**
 * The home deadline of уголки as the screen shows it. From `HOME_PLIES` a
 * man still in its own home loses the game (RULES.md, "Blocking"), and a
 * player who has never read that far sees the loss come out of nowhere,
 * often with the opponent walling the last man in on purpose. So the
 * screen counts the player's last moves down and rings the men that have
 * to leave; once the rule has ended a game, the same ring shows which men
 * it caught.
 */
import { menAtHome } from '../corners/board.ts'
import { endingOf, movesBeforeDeadline } from '../corners/status.ts'
import { legalMoves } from '../game/moves.ts'
import type { GameStatus, Position, Square } from '../game/types.ts'
import { displayPosition, isReviewing } from './gameReducer.ts'
import type { GameState } from './gameReducer.ts'

export type Deadline = {
  /** Men that have to leave home, or that stayed and ended the game. */
  readonly squares: ReadonlyArray<Square>
  /**
   * Moves their side still has to get them out. None once its last move
   * before the deadline is played, and none after the deadline.
   */
  readonly moves: number
}

/** Moves before the deadline at which the screen starts counting down. */
export const NOTICE_MOVES = 10

/**
 * What the deadline means for the player right now, given how the game
 * stands, or nothing: at checkers, while an earlier position is being
 * reviewed, while their men are all out, or while the deadline is still
 * further off than `NOTICE_MOVES`. Against a persona the player's own men
 * are the concern, whoever is to move, so the notice does not blink while
 * the persona thinks; in a game for two it is whoever is to move who is
 * told. The men are read off the position the board draws, so the ring
 * and the piece can never disagree about where a man is.
 */
export function deadlineOf(
  state: GameState,
  status: GameStatus,
): Deadline | null {
  if (state.setup.variant !== 'corners' || isReviewing(state)) return null
  const position = displayPosition(state)
  if (status !== 'ongoing') return caught(position)
  const human = state.setup.humanColor
  const color = human === 'both' ? position.toMove : human
  const squares = menAtHome(position, color)
  const moves = movesBeforeDeadline(position, color)
  if (squares.length === 0 || moves > NOTICE_MOVES) return null
  return { squares, moves }
}

/**
 * The men the home rule ended the game on, both sides' when it drew. A
 * game that ended any other way — a filled target, the clock, an
 * agreement — has nothing to ring, whatever is left at home.
 */
function caught(position: Position): Deadline | null {
  const ending = endingOf(position, legalMoves(position, 'corners').length)
  if (ending !== 'blocked') return null
  return {
    squares: [...menAtHome(position, 'white'), ...menAtHome(position, 'black')],
    moves: 0,
  }
}
