/**
 * Chess clock maths. Nothing here reads a clock: every function is given
 * the current monotonic time, so the reducer stays pure and the tests stay
 * deterministic. The remaining time is never counted down — it is derived
 * from the snapshot taken when the turn began, which is what lets undo,
 * redo and review restore it exactly.
 */
import { timingFor } from '../game/timeControl.ts'
import type { TimeControl, Timing } from '../game/timeControl.ts'
import type { Color } from '../game/types.ts'

/** Milliseconds left, per side, at a ply boundary. */
export type Remaining = Readonly<Record<Color, number>>

/**
 * Where a bank ran out. The flag belongs to the ply it fell on, the same
 * way a win by the rules belongs to the position that has no moves in it:
 * step back before that ply and the game is live again, land on it or
 * anywhere after it and the loss stands.
 */
export type Flag = {
  readonly color: Color
  readonly ply: number
}

export type ClockState = {
  readonly control: TimeControl
  /** The control resolved onto the board: whose clock each colour plays. */
  readonly timings: Readonly<Record<Color, Timing>>
  /**
   * `times[i]` is what both clocks showed when position `i` appeared, so
   * the array is always one longer than the move list and is truncated
   * with it.
   */
  readonly times: ReadonlyArray<Remaining>
  /**
   * When the side to move started its turn, or `null` while the clock is
   * frozen: an earlier position is on the board, or the game is over.
   */
  readonly startedAt: number | null
  /** The ply a bank ran out on, and whose it was; it lost. */
  readonly flagged: Flag | null
}

/**
 * A clock at its starting banks. `human` says which colour the player has,
 * so a control that gives the two sides different clocks lands the right
 * way round. `now` is `null` when the caller has no moment to offer: the
 * clock exists but is not running, and the first stamped action starts it.
 */
export function createClock(
  control: TimeControl,
  human: Color | 'both',
  now: number | null,
): ClockState {
  const timings = {
    white: timingFor(control, 'white', human),
    black: timingFor(control, 'black', human),
  }
  return {
    control,
    timings,
    times: [{ white: timings.white.initialMs, black: timings.black.initialMs }],
    startedAt: now,
    flagged: null,
  }
}

/** The side that had lost on time by `ply`, if any. */
export function flaggedAt(clock: ClockState, ply: number): Color | null {
  const fallen = clock.flagged
  return fallen !== null && fallen.ply <= ply ? fallen.color : null
}

/** What both clocks showed when the position at `ply` appeared. */
export function snapshot(clock: ClockState, ply: number): Remaining {
  const at = clock.times[ply]
  if (at === undefined) throw new Error(`no clock snapshot for ply ${ply}`)
  return at
}

/** Time the running side has burned since its turn began. */
function spent(clock: ClockState, now: number): number {
  if (clock.startedAt === null) return 0
  return Math.max(0, now - clock.startedAt)
}

/** What both clocks show at `now`; only the side to move is charged. */
export function remaining(
  clock: ClockState,
  ply: number,
  toMove: Color,
  now: number,
): Remaining {
  const at = snapshot(clock, ply)
  const fallen = flaggedAt(clock, ply)
  if (fallen !== null) return { ...at, [fallen]: 0 }
  if (clock.startedAt === null) return at
  return { ...at, [toMove]: Math.max(0, at[toMove] - spent(clock, now)) }
}

/**
 * True once the side to move has burned the bank it started the turn
 * with. A frozen clock never falls, because nobody is being charged —
 * which covers a clock that has already flagged; ask `flaggedAt` about
 * that one.
 */
export function hasFlagged(
  clock: ClockState,
  ply: number,
  toMove: Color,
  now: number,
): boolean {
  if (clock.startedAt === null) return false
  return snapshot(clock, ply)[toMove] - spent(clock, now) <= 0
}

/**
 * Charges the mover for the turn it just finished, adds the increment and
 * starts the other side's turn. Snapshots after `ply` belong to a line
 * that has just been abandoned, so they go with the move list.
 *
 * `now` is `null` when the action carried no timestamp: the move counts
 * and the increment is given, but the clock stops rather than charge the
 * next player from a moment that belongs to the last one. The next
 * stamped action starts it again.
 */
export function commitMove(
  clock: ClockState,
  ply: number,
  toMove: Color,
  now: number | null,
): ClockState {
  const at = snapshot(clock, ply)
  const left =
    now === null ? at[toMove] : Math.max(0, at[toMove] - spent(clock, now))
  const next: Remaining = {
    ...at,
    [toMove]: left + clock.timings[toMove].incrementMs,
  }
  return {
    ...clock,
    times: [...clock.times.slice(0, ply + 1), next],
    startedAt: now,
    // A move is only legal on a live position, so any flag on this clock
    // fell in the line that has just been abandoned.
    flagged: null,
  }
}

/**
 * Moves to `ply` along the timeline, giving the side to move its whole
 * turn back. `running` says whether the board wants a clock there; it is
 * frozen anyway on a ply the game had already been lost on.
 */
export function seek(
  clock: ClockState,
  ply: number,
  running: boolean,
  now: number | null,
): ClockState {
  snapshot(clock, ply) // the ply must exist
  return {
    ...clock,
    startedAt: running && flaggedAt(clock, ply) === null ? now : null,
  }
}

/**
 * Charges the side to move for the turn it was sitting on and stops the
 * clock there. The game was settled on that turn without a move being
 * played — the players agreed — so the time it took is taken off the bank,
 * but no increment is given and the timeline does not grow. The snapshot
 * of the ply is rewritten rather than added to, so every readout keeps
 * showing what the clock really came to rest at.
 */
export function settle(
  clock: ClockState,
  ply: number,
  toMove: Color,
  now: number | null,
): ClockState {
  if (now === null) return stop(clock)
  const at = snapshot(clock, ply)
  const left = Math.max(0, at[toMove] - spent(clock, now))
  return {
    ...clock,
    times: [...clock.times.slice(0, ply), { ...at, [toMove]: left }],
    startedAt: null,
  }
}

/** Ends the game on time at `ply`; the clock stops where it stands. */
export function flag(clock: ClockState, color: Color, ply: number): ClockState {
  return { ...clock, startedAt: null, flagged: { color, ply } }
}

/** Stops the clock without a flag: the board decided the game instead. */
export function stop(clock: ClockState): ClockState {
  return clock.startedAt === null ? clock : { ...clock, startedAt: null }
}
