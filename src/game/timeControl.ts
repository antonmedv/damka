import type { Color } from './types.ts'

/**
 * Time controls a game can be played at. A timing is the bank a side
 * starts with and the Fischer increment added to its bank after every
 * completed move; a control holds one for each side, because the two need
 * not be equal — a player may give the computer a minute while keeping
 * ten.
 */
export type Timing = {
  /** Bank at the start; 0 only in the untimed game. */
  readonly initialMs: number
  /** Added to this side's bank after every completed move. */
  readonly incrementMs: number
}

/**
 * `none` is the untimed game. `15+10` gives both sides the same timing;
 * `15+10:1+0` gives the first to the player and the second to the
 * opponent. The presets are what the new game dialog offers, but any id
 * inside the limits below is playable, so a player can set their own.
 */
export type TimeControlId =
  | 'none'
  | `${number}+${number}`
  | `${number}+${number}:${number}+${number}`

export type TimeControl = {
  readonly id: TimeControlId
  /** The human's timing; white's in a game of two humans on one device. */
  readonly own: Timing
  /** The other side's; equal to `own` unless the clocks were split. */
  readonly opponent: Timing
}

const SECOND = 1000
const MINUTE = 60 * SECOND

/** Limits of a timing set by hand; wide enough for any game worth playing. */
export const MAX_MINUTES = 180
export const MAX_INCREMENT = 180

const UNTIMED: Timing = { initialMs: 0, incrementMs: 0 }

export const NO_CLOCK: TimeControl = {
  id: 'none',
  own: UNTIMED,
  opponent: UNTIMED,
}

/** A bank worth playing: whole minutes, at least one, inside the limit. */
export function isValidMinutes(minutes: number): boolean {
  return Number.isInteger(minutes) && minutes >= 1 && minutes <= MAX_MINUTES
}

/** An increment may be nothing at all, but not a fraction of a second. */
export function isValidIncrement(increment: number): boolean {
  return (
    Number.isInteger(increment) && increment >= 0 && increment <= MAX_INCREMENT
  )
}

/** Whole minutes and seconds inside the limits; nothing else is playable. */
export function isValidTiming(minutes: number, increment: number): boolean {
  return isValidMinutes(minutes) && isValidIncrement(increment)
}

/** One side's clock; throws on a timing nobody may play. */
export function timing(minutes: number, increment: number): Timing {
  if (!isValidTiming(minutes, increment)) {
    throw new Error(`bad timing: ${minutes}+${increment}`)
  }
  return { initialMs: minutes * MINUTE, incrementMs: increment * SECOND }
}

/** Whole minutes of a bank; the dialog shows these, not milliseconds. */
export function minutesOf(side: Timing): number {
  return Math.round(side.initialMs / MINUTE)
}

export function incrementOf(side: Timing): number {
  return Math.round(side.incrementMs / SECOND)
}

export function sameTiming(a: Timing, b: Timing): boolean {
  return a.initialMs === b.initialMs && a.incrementMs === b.incrementMs
}

/** The two sides have been given different clocks. */
export function isSplit(control: TimeControl): boolean {
  return !sameTiming(control.own, control.opponent)
}

export function timeControlId(
  own: Timing,
  opponent: Timing = own,
): TimeControlId {
  const first = `${minutesOf(own)}+${incrementOf(own)}` as const
  if (sameTiming(own, opponent)) return first
  return `${first}:${minutesOf(opponent)}+${incrementOf(opponent)}`
}

const TIMING = /^(\d{1,3})\+(\d{1,3})$/

function parseTiming(part: string): Timing | null {
  const parts = TIMING.exec(part)
  if (parts === null) return null
  const minutes = Number(parts[1])
  const increment = Number(parts[2])
  if (!isValidTiming(minutes, increment)) return null
  return timing(minutes, increment)
}

export function timeControlById(id: string): TimeControl {
  if (id === 'none') return NO_CLOCK
  const halves = id.split(':')
  const own = halves.length <= 2 ? parseTiming(halves[0] ?? '') : null
  const opponent =
    halves.length === 1
      ? own
      : halves.length === 2
        ? parseTiming(halves[1]!)
        : null
  if (own === null || opponent === null) {
    throw new Error(`unknown time control: ${id}`)
  }
  return { id: timeControlId(own, opponent), own, opponent }
}

/** Offered in the dialog, in the order they are shown; untimed first. */
export const presetIds = [
  'none',
  '5+0',
  '10+5',
] as const satisfies ReadonlyArray<TimeControlId>

export const timeControls: ReadonlyArray<TimeControl> =
  presetIds.map(timeControlById)

export function isPreset(id: string): boolean {
  return presetIds.some((preset) => preset === id)
}

/**
 * The clock a colour plays on. `human` is the side the player has, or
 * `both` in a game of two humans — where there is nobody to call the
 * opponent, so white takes the player's clock and black the other one.
 */
export function timingFor(
  control: TimeControl,
  color: Color,
  human: Color | 'both',
): Timing {
  const own = human === 'both' ? 'white' : human
  return color === own ? control.own : control.opponent
}

/** A game is on the clock when there is a bank to run out of. */
export function isTimed(control: TimeControl): boolean {
  return control.own.initialMs > 0 || control.opponent.initialMs > 0
}

/**
 * The control an id names, for an id we did not build ourselves — one out
 * of storage, a query string or an old link. Anything unplayable is
 * reported and the game goes untimed, rather than a throw during a render
 * taking the screen with it.
 */
export function timeControlOf(id: TimeControlId | undefined): TimeControl {
  if (id === undefined) return NO_CLOCK
  try {
    return timeControlById(id)
  } catch (error) {
    console.error('ignoring time control', error)
    return NO_CLOCK
  }
}

/** Below this the seconds are worth a tenth; above it they are not. */
const TENTHS_BELOW_MS = 20_000

/** Whole seconds as `m:ss`, rounded up; the shape both readouts share. */
function minutesAndSeconds(ms: number): string {
  const seconds = Math.ceil(Math.max(0, ms) / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/**
 * A span of time that has already been spent, as `m:ss`. Unlike a bank,
 * it is never read at a glance under pressure, so it keeps one shape all
 * the way down; a move that took any time at all shows as a second rather
 * than as nothing.
 */
export function formatDuration(ms: number): string {
  return minutesAndSeconds(ms)
}

/**
 * `m:ss` while there is time to think, tenths of a second once there is
 * not. Both halves round up, so the clock reads 0:01 until the last moment
 * and lands on 0.0 exactly when the flag falls, never before it.
 */
export function formatClock(ms: number): string {
  const left = Math.max(0, ms)
  if (left >= TENTHS_BELOW_MS) return minutesAndSeconds(left)
  const tenths = Math.ceil(left / 100)
  return `${Math.floor(tenths / 10)}.${tenths % 10}`
}
