import { BLACK_WINS, DRAW, ONGOING, WHITE_WINS } from '../engine/status.ts'
import type { Color, Position } from '../game/types.ts'
import {
  BLACK,
  BLACK_HOME,
  BLACK_MAN,
  COUNT,
  WHITE,
  WHITE_HOME,
  WHITE_MAN,
  countOn,
  load,
} from './board.ts'

/**
 * Plies after which a man in its own home loses: forty moves each. From
 * here on the rule is read at every position, so a man moved back home
 * loses at once too.
 */
export const HOME_PLIES = 80
/**
 * Plies after which the game ends whatever the board says, eighty moves
 * each: more men in the target wins, the same number is a draw.
 */
export const LIMIT_PLIES = 160

/**
 * Game state on the loaded board before `side` moves, with `ply` plies
 * played, from the rules that need no move list (RULES.md, "Уголки"):
 *
 * - both sides have filled their targets: a draw, since Black reached it
 *   with the answer to White's finish;
 * - Black has filled its target: Black wins. White moved first, so White
 *   has already had its answer;
 * - White has filled its target and it is White's turn: White wins.
 *   Black's turn means Black still has its answer, and the game goes on;
 * - from `HOME_PLIES`: a man in its own home loses its side the game, both
 *   sides at once a draw;
 * - from `LIMIT_PLIES`: the count in the targets decides.
 *
 * A side with no legal move loses as well, but that needs the move list,
 * which the search generates only after this has returned `ONGOING`; the
 * callers apply it (`status` does so for the UI).
 */
export function statusOf(side: number, ply: number): number {
  const whiteIn = countOn(BLACK_HOME, WHITE_MAN)
  const blackIn = countOn(WHITE_HOME, BLACK_MAN)
  const whiteDone = finished(WHITE, whiteIn)
  const blackDone = finished(BLACK, blackIn)
  if (whiteDone && blackDone) return DRAW
  if (blackDone) return BLACK_WINS
  if (whiteDone && side === WHITE) return WHITE_WINS
  if (ply >= HOME_PLIES) {
    const whiteHome = countOn(WHITE_HOME, WHITE_MAN) > 0
    const blackHome = countOn(BLACK_HOME, BLACK_MAN) > 0
    if (whiteHome && blackHome) return DRAW
    if (whiteHome) return BLACK_WINS
    if (blackHome) return WHITE_WINS
  }
  if (ply >= LIMIT_PLIES) {
    if (whiteIn !== blackIn) return whiteIn > blackIn ? WHITE_WINS : BLACK_WINS
    return DRAW
  }
  return ONGOING
}

/**
 * Whether `side` has filled its target, given its men there. A side with
 * no men at all has filled nothing: such a position comes only from a
 * hand-made literal, and it ends by the no-move rule instead.
 */
function finished(side: number, inTarget: number): boolean {
  return COUNT[side]! > 0 && inTarget === COUNT[side]
}

/** The side with no move loses, from the point of view of the winner. */
export function noMoveStatus(side: number): number {
  return side === WHITE ? BLACK_WINS : WHITE_WINS
}

/**
 * `statusOf` for the UI boundary, given how many legal moves the side to
 * move has. Loads the position, so it is not for the search.
 */
export function status(position: Position, moveCount: number): number {
  load(position)
  const side = position.toMove === 'white' ? WHITE : BLACK
  const result = statusOf(side, position.ply)
  if (result !== ONGOING) return result
  return moveCount === 0 ? noMoveStatus(side) : ONGOING
}

/**
 * Moves `color` still makes before the home rule is first read, at
 * `HOME_PLIES`: the time it has left to get its men out. One when the move
 * at hand is its last, none once that is played.
 */
export function movesBeforeDeadline(position: Position, color: Color): number {
  const plies = Math.max(0, HOME_PLIES - position.ply)
  return position.toMove === color ? (plies + 1) >> 1 : plies >> 1
}

/**
 * Why a finished game ended, read off its last position, for the result
 * screen: `finish` when a side filled its target (a draw here means both
 * did), `blocked` when men were left at home past `HOME_PLIES`, `limit`
 * when the count decided at `LIMIT_PLIES`, `noMoves` when the side to move
 * had none, and `none` while the game is still going.
 */
export type Ending = 'finish' | 'blocked' | 'limit' | 'noMoves' | 'none'

export function endingOf(position: Position, moveCount: number): Ending {
  const result = status(position, moveCount)
  if (result === ONGOING) return 'none'
  const whiteIn = countOn(BLACK_HOME, WHITE_MAN)
  const blackIn = countOn(WHITE_HOME, BLACK_MAN)
  if (finished(WHITE, whiteIn) || finished(BLACK, blackIn)) return 'finish'
  if (position.ply >= HOME_PLIES) {
    if (
      countOn(WHITE_HOME, WHITE_MAN) > 0 ||
      countOn(BLACK_HOME, BLACK_MAN) > 0
    ) {
      return 'blocked'
    }
  }
  return position.ply >= LIMIT_PLIES ? 'limit' : 'noMoves'
}
