/**
 * What the opponent has to say under its own face. One line at a time, and
 * only when there is something to say: how the game ended, an offer the
 * persona is making, or a remark on a move worth remarking on. Everything
 * is read off the state, so the bubble never has a memory of its own.
 */
import { opposite } from '../game/board.ts'
import type { GameStatus, GameVariant, Move } from '../game/types.ts'
import type { Deadline } from '../state/deadline.ts'
import {
  currentOffer,
  currentPosition,
  isReviewing,
  lastMove,
} from '../state/gameReducer.ts'
import type { GameState, OfferKind } from '../state/gameReducer.ts'

export type RemarkId =
  /** Checkers: taking pieces is good news, being taken from is not. */
  | 'feast'
  | 'crowned'
  | 'ouch'
  | 'praise'
  /** Поддавки: the same events, with the sentiment the other way round. */
  | 'stuffed'
  | 'fed'
  | 'burdened'
  | 'unloaded'
  /** Уголки: a long chain of jumps, by the opponent and by the human. */
  | 'leap'
  | 'nimble'

export type Banter =
  /** The game is over; the bubble reads the result and reopens the screen. */
  | { readonly kind: 'result' }
  | { readonly kind: 'offer'; readonly offer: OfferKind }
  /** Уголки: the player has this many moves to get their men out of home. */
  | { readonly kind: 'deadline'; readonly moves: number }
  | { readonly kind: 'remark'; readonly id: RemarkId }

/** Pieces taken in one move before the opponent bothers to comment. */
const HAUL = 2
/** Landing squares of an уголки chain before it is a leap worth a word. */
const LEAP = 3

/** A remark on the mover's move and the same event seen from the other side. */
type Remarks = readonly [own: RemarkId, theirs: RemarkId]

/**
 * Which remark an event earns at the two checkers games, by who it
 * happened to. The events are the same in both and mean opposite things:
 * a pile of pieces taken is a feast at checkers and a force-feeding at
 * поддавки, and a crown is a prize at one and a millstone at the other.
 */
const REMARKS = {
  checkers: {
    promotes: ['crowned', 'praise'],
    haul: ['feast', 'ouch'],
  },
  giveaway: {
    promotes: ['burdened', 'unloaded'],
    haul: ['stuffed', 'fed'],
  },
} as const satisfies Record<
  Exclude<GameVariant, 'corners'>,
  Record<'promotes' | 'haul', Remarks>
>

/** What `move` earns a word at `variant`, if anything. */
function remarksOn(variant: GameVariant, move: Move): Remarks | null {
  // Nothing is taken and nobody is crowned at уголки; the event worth a
  // word is a man carried across the board in one chain.
  if (variant === 'corners') {
    return move.path.length >= LEAP ? ['leap', 'nimble'] : null
  }
  const remarks = REMARKS[variant]
  if (move.promotes) return remarks.promotes
  if (move.captures.length >= HAUL) return remarks.haul
  return null
}

export function banterOf(
  state: GameState,
  /** How the game stands; the screen has already worked it out. */
  status: GameStatus,
  /** The уголки home deadline, likewise; `null` where it says nothing. */
  deadline: Deadline | null,
): Banter | null {
  if (status !== 'ongoing') return { kind: 'result' }
  const offer = currentOffer(state, status)
  if (offer !== null) return { kind: 'offer', offer }
  // A rule about to end the game is worth more than a word on a move, and
  // is said to two humans as well. Nothing once the last move is played:
  // the result is about to say it.
  if (deadline !== null && deadline.moves > 0) {
    return { kind: 'deadline', moves: deadline.moves }
  }
  // Two humans share the screen and the opponent has no voice; and a move
  // being looked at again is not one to react to a second time.
  if (state.setup.humanColor === 'both' || isReviewing(state)) return null
  const move = lastMove(state)
  if (move === null) return null
  const remarks = remarksOn(state.setup.variant, move)
  if (remarks === null) return null
  // Whoever is not to move now is the side that played it.
  const own = opposite(currentPosition(state).toMove) !== state.setup.humanColor
  return { kind: 'remark', id: remarks[own ? 0 : 1] }
}
