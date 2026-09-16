/**
 * What the opponent has to say under its own face. One line at a time, and
 * only when there is something to say: how the game ended, an offer the
 * persona is making, or a remark on a move worth remarking on. Everything
 * is read off the state, so the bubble never has a memory of its own.
 */
import { opposite } from '../game/board.ts'
import type { GameStatus } from '../game/types.ts'
import {
  currentOffer,
  currentPosition,
  isReviewing,
  lastMove,
} from '../state/gameReducer.ts'
import type { GameState, OfferKind } from '../state/gameReducer.ts'

export type RemarkId = 'feast' | 'crowned' | 'ouch' | 'praise'

export type Banter =
  /** The game is over; the bubble reads the result and reopens the screen. */
  | { readonly kind: 'result' }
  | { readonly kind: 'offer'; readonly offer: OfferKind }
  | { readonly kind: 'remark'; readonly id: RemarkId }

/** Pieces taken in one move before the opponent bothers to comment. */
const HAUL = 2

export function banterOf(
  state: GameState,
  /** How the game stands; the screen has already worked it out. */
  status: GameStatus,
): Banter | null {
  if (status !== 'ongoing') return { kind: 'result' }
  const offer = currentOffer(state, status)
  if (offer !== null) return { kind: 'offer', offer }
  // Two humans share the screen and the opponent has no voice; and a move
  // being looked at again is not one to react to a second time.
  if (state.setup.humanColor === 'both' || isReviewing(state)) return null
  const move = lastMove(state)
  if (move === null) return null
  // Whoever is not to move now is the side that played it.
  const own = opposite(currentPosition(state).toMove) !== state.setup.humanColor
  if (move.promotes) return { kind: 'remark', id: own ? 'crowned' : 'praise' }
  if (move.captures.length >= HAUL) {
    return { kind: 'remark', id: own ? 'feast' : 'ouch' }
  }
  return null
}
