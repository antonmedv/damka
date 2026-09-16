import { timeControlById } from '../game/timeControl.ts'
import type { TimeControlId } from '../game/timeControl.ts'
import type { Color } from '../game/types.ts'
import { opponentById, opponents } from '../opponents/opponents.ts'
import type { OpponentId } from '../opponents/opponents.ts'
import { defaultSetup } from './gameReducer.ts'
import type { GameSetup } from './gameReducer.ts'

/** What the dialog asks for; 'random' is a wish, not yet a colour. */
export type ColorChoice = Color | 'random'

/**
 * The last game the player set up, remembered so the next one opens on it
 * rather than on our defaults. The colour is kept as it was asked for, so
 * "случайно" stays random instead of hardening into the colour it rolled.
 */
export type GamePrefs = {
  readonly opponentId: OpponentId
  readonly color: ColorChoice
  readonly timeControlId: TimeControlId
}

const STORAGE_KEY = 'damka.newGame'

export const defaultPrefs: GamePrefs = {
  opponentId: defaultSetup.opponentId,
  color: choiceOf(defaultSetup.humanColor),
  timeControlId: defaultSetup.timeControlId ?? 'none',
}

/**
 * The colour a form should offer for a game already under way. Two humans
 * on one device hold both colours, which is not a choice anyone makes in
 * the dialog; white is what they are offered.
 */
export function choiceOf(humanColor: Color | 'both'): ColorChoice {
  return humanColor === 'both' ? 'white' : humanColor
}

/**
 * Whatever was stored last, field by field: an unreadable store, older
 * shape or value we no longer play falls back to the default for that
 * field alone. Storage may be blocked (private mode, third-party frame);
 * then the game simply starts on the defaults.
 */
export function loadPrefs(): GamePrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return defaultPrefs
    return sanitize(JSON.parse(raw) as unknown)
  } catch {
    return defaultPrefs
  }
}

export function savePrefs(prefs: GamePrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // Not remembered; the game still plays.
  }
}

export function prefsFrom(setup: GameSetup, color: ColorChoice): GamePrefs {
  return {
    opponentId: setup.opponentId,
    color,
    timeControlId: setup.timeControlId ?? 'none',
  }
}

/** The game those preferences describe; a random colour is rolled here. */
export function setupFrom(
  prefs: GamePrefs,
  rng: () => number = Math.random,
): GameSetup {
  const versusComputer = opponentById(prefs.opponentId).kind === 'computer'
  return {
    opponentId: prefs.opponentId,
    humanColor: versusComputer ? resolveColor(prefs.color, rng) : 'both',
    timeControlId: prefs.timeControlId,
  }
}

export function resolveColor(choice: ColorChoice, rng: () => number): Color {
  if (choice !== 'random') return choice
  return rng() < 0.5 ? 'white' : 'black'
}

const CHOICES: ReadonlyArray<ColorChoice> = ['white', 'black', 'random']

function sanitize(value: unknown): GamePrefs {
  if (typeof value !== 'object' || value === null) return defaultPrefs
  const stored = value as Record<string, unknown>
  return {
    opponentId: opponentId(stored['opponentId']),
    color: CHOICES.find((c) => c === stored['color']) ?? defaultPrefs.color,
    timeControlId: timeControlId(stored['timeControlId']),
  }
}

function opponentId(value: unknown): OpponentId {
  return opponents.find((o) => o.id === value)?.id ?? defaultPrefs.opponentId
}

/** A stored control is playable or it is dropped; presets included. */
function timeControlId(value: unknown): TimeControlId {
  if (typeof value !== 'string') return defaultPrefs.timeControlId
  try {
    return timeControlById(value).id
  } catch {
    return defaultPrefs.timeControlId
  }
}
