import { moveFrom, movePromotes, moveTo } from './move.ts'
import { BLACK, WHITE } from './position.ts'
import type { BitPosition } from './position.ts'

/** Result of the last `makeMove`: white, black, kings, plies. */
export const APPLIED = new Int32Array(4)

/**
 * Plays packed move (`m0`, `m1`) for `side` and leaves the new bitboards
 * in `APPLIED`; the side to move flips at the caller. The draw counter
 * counts consecutive quiet king moves: any capture or man move resets it.
 */
export function makeMove(
  white: number,
  black: number,
  kings: number,
  side: number,
  plies: number,
  m0: number,
  m1: number,
): void {
  const fromBit = 1 << moveFrom(m0)
  const toBit = 1 << moveTo(m0)
  const wasKing = (kings & fromBit) !== 0
  const isKing = wasKing || movePromotes(m0) !== 0
  const newKings = (kings & ~fromBit & ~m1) | (isKing ? toBit : 0)
  if (side === WHITE) {
    APPLIED[0] = (white ^ fromBit) | toBit
    APPLIED[1] = black & ~m1
  } else {
    APPLIED[0] = white & ~m1
    APPLIED[1] = (black ^ fromBit) | toBit
  }
  APPLIED[2] = newKings
  APPLIED[3] = m1 !== 0 || !wasKing ? 0 : plies + 1
}

/** Object form of `makeMove` for tests and the UI boundary. */
export function applyMove(p: BitPosition, m0: number, m1: number): BitPosition {
  makeMove(p.white, p.black, p.kings, p.side, p.plies, m0, m1)
  return {
    white: APPLIED[0]!,
    black: APPLIED[1]!,
    kings: APPLIED[2]!,
    side: p.side === WHITE ? BLACK : WHITE,
    plies: APPLIED[3]!,
  }
}
