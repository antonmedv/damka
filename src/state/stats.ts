/**
 * What the finished game looked like, read off the timeline: what each
 * side held after every ply, and the tally the result screen shows beside
 * the graph. Nothing here reads a clock or the board — a state is enough —
 * so the numbers are the same however the game is being viewed.
 *
 * The two kinds of game measure themselves differently. Checkers and
 * поддавки count material; уголки counts the squares each side has left
 * to walk. A point carries both readings, and `advantage` is the one the
 * game is played for.
 */
import { distanceLeft, isStep } from '../corners/board.ts'
import type { Color, GameVariant, Move, Position } from '../game/types.ts'
import type { ClockState } from './clock.ts'
import type { GameState } from './gameReducer.ts'

/** A king is worth three men, the exchange rate the engine evaluates with. */
export const KING_WEIGHT = 3

export type Material = {
  readonly men: number
  readonly kings: number
  /** Men plus kings at `KING_WEIGHT`, the number the graph is drawn from. */
  readonly value: number
}

export type Point = {
  /** Plies played into the position; 0 is the opening. */
  readonly ply: number
  readonly white: Material
  readonly black: Material
  /** Squares each side still has to walk at уголки; 0 at checkers. */
  readonly left: Readonly<Record<Color, number>>
  /**
   * White's lead as the game counts it, in men at checkers and in squares
   * at уголки; negative while Black leads. Поддавки reads the material
   * lead upside down, which the chart does.
   */
  readonly advantage: number
}

export type SideStats = {
  readonly moves: number
  /** Pieces taken, which is more than the number of capturing moves. */
  readonly taken: number
  /** The most pieces taken in one move; 0 where none were. */
  readonly best: number
  readonly crowned: number
  /** Уголки: moves that jumped rather than stepped. */
  readonly leaps: number
  /** Уголки: the most jumps in one move; 0 where none were. */
  readonly longestLeap: number
  /** Milliseconds spent on the side's own moves; 0 in an untimed game. */
  readonly spentMs: number
  /** The single longest move; 0 where there is no clock to measure it. */
  readonly longestMs: number
}

export type GameStats = {
  /** One per position of the timeline, the opening included. */
  readonly points: ReadonlyArray<Point>
  readonly white: SideStats
  readonly black: SideStats
  readonly timed: boolean
}

export function materialOf(position: Position, color: Color): Material {
  let men = 0
  let kings = 0
  for (const piece of position.board) {
    if (piece === undefined || piece.color !== color) continue
    if (piece.kind === 'king') kings++
    else men++
  }
  return { men, kings, value: men + kings * KING_WEIGHT }
}

/** The whole line as it stands, whichever position is being shown. */
function timeline(state: GameState): ReadonlyArray<Position> {
  const h = state.history
  return [...h.past, h.present, ...h.future]
}

/**
 * Milliseconds the mover spent on the move played at `ply`. The bank is
 * only snapshotted at ply boundaries, so the time is what the clock lost
 * across the move with the increment added back. Missing snapshots — an
 * untimed game, or the ply the game ended on — mean nothing was measured.
 */
function spentOn(clock: ClockState, ply: number, mover: Color): number {
  const before = clock.times[ply]
  const after = clock.times[ply + 1]
  if (before === undefined || after === undefined) return 0
  const increment = clock.timings[mover].incrementMs
  return Math.max(0, before[mover] + increment - after[mover])
}

type Tally = {
  moves: number
  taken: number
  best: number
  crowned: number
  leaps: number
  longestLeap: number
  spentMs: number
  longestMs: number
}

function emptyTally(): Tally {
  return {
    moves: 0,
    taken: 0,
    best: 0,
    crowned: 0,
    leaps: 0,
    longestLeap: 0,
    spentMs: 0,
    longestMs: 0,
  }
}

/** Jumps in an уголки move: none for a step, one per landing square else. */
function leapsOf(move: Move): number {
  return isStep(move.from, move.to) ? 0 : move.path.length
}

/** White's lead the way `variant` counts it; see `Point.advantage`. */
function advantageOf(
  variant: GameVariant,
  white: Material,
  black: Material,
  left: Readonly<Record<Color, number>>,
): number {
  return variant === 'corners'
    ? left.black - left.white
    : white.value - black.value
}

export function gameStats(state: GameState): GameStats {
  const positions = timeline(state)
  const clock = state.clock
  const tallies: Record<Color, Tally> = {
    white: emptyTally(),
    black: emptyTally(),
  }
  state.moves.forEach((move: Move, ply: number) => {
    // The side that played it, taken from the position it was played in:
    // a game may start from a position with Black to move.
    const mover = positions[ply]?.toMove ?? 'white'
    const tally = tallies[mover]
    tally.moves++
    if (move.captures.length > 0) {
      tally.taken += move.captures.length
      tally.best = Math.max(tally.best, move.captures.length)
    }
    if (move.promotes) tally.crowned++
    if (state.setup.variant === 'corners') {
      const leaps = leapsOf(move)
      if (leaps > 0) tally.leaps++
      tally.longestLeap = Math.max(tally.longestLeap, leaps)
    }
    if (clock !== null) {
      const spent = spentOn(clock, ply, mover)
      tally.spentMs += spent
      tally.longestMs = Math.max(tally.longestMs, spent)
    }
  })

  // The turn the loser was still sitting on when the flag fell is a turn
  // nothing else measures: it ends no move, so it leaves no snapshot. What
  // it cost them is exactly what they had left when it began.
  const fallen = clock?.flagged ?? null
  if (fallen !== null) {
    const left = clock?.times[fallen.ply]?.[fallen.color] ?? 0
    const tally = tallies[fallen.color]
    tally.spentMs += left
    tally.longestMs = Math.max(tally.longestMs, left)
  }

  const variant = state.setup.variant
  const points = positions.map((position, ply) => {
    const white = materialOf(position, 'white')
    const black = materialOf(position, 'black')
    const left =
      variant === 'corners'
        ? {
            white: distanceLeft(position, 'white'),
            black: distanceLeft(position, 'black'),
          }
        : { white: 0, black: 0 }
    return {
      ply,
      white,
      black,
      left,
      advantage: advantageOf(variant, white, black, left),
    }
  })

  return {
    points,
    white: tallies.white,
    black: tallies.black,
    timed: clock !== null,
  }
}
