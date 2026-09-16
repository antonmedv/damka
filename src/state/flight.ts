import type { Square } from '../game/types.ts'

/**
 * A journey a piece makes across the board: where it stands when it takes
 * off, and the landing squares it has yet to reach, in order. A whole
 * `Move` is one flight, and so is the part of a capture that the player
 * has not carried the piece over themselves. The reducer decides what
 * flies; `ui/slide.ts` decides what that looks like.
 */
export type Flight = {
  readonly from: Square
  /** Landing squares in order; the piece ends up on the last one. */
  readonly path: ReadonlyArray<Square>
}

/** The square the flight ends on. */
export function flightTo(flight: Flight): Square {
  return flight.path[flight.path.length - 1]!
}
