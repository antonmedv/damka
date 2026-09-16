import { fromBitPosition } from '../engine/adapter.ts'
import { parsePos } from '../engine/position.ts'
import type { Color, Position } from '../game/types.ts'
import { FRIEND_ID, opponents } from '../opponents/opponents.ts'
import type { OpponentId } from '../opponents/opponents.ts'
import type { GameSetup } from './gameReducer.ts'
import { defaultPrefs, setupFrom } from './preferences.ts'
import type { ColorChoice, GamePrefs } from './preferences.ts'

/** How the first game of a page load starts. */
export type Start = {
  readonly setup: GameSetup
  /** Where to start from; `null` means the normal opening. */
  readonly position: Position | null
  /** What the new game dialog preselects; 'random' survives a reload. */
  readonly colorChoice: ColorChoice
  /** Whether the computer may use the endgame tables; `?db=off` turns
   * them off, to see what the same search does without them. */
  readonly endgameDb: boolean
}

export const defaultStart: Start = {
  setup: setupFrom(defaultPrefs),
  position: null,
  colorChoice: defaultPrefs.color,
  endgameDb: true,
}

const COLORS: ReadonlyArray<Color | 'both'> = ['white', 'black', 'both']

/**
 * Start read from the query string, so a position can be tried by hand
 * without playing up to it:
 *
 *     ?pos=W:Wd2:Bc3,e3,c5,e5,g3
 *     ?pos=W:Wc3:Bd4,d6&vs=fox&side=white
 *     ?pos=W:WKa1,Kb2,Kc3:BKf4&vs=raven&side=black&db=off
 *
 * `pos` is the position literal of `parsePos` (side to move, white pieces,
 * black pieces, `K` for a king). `vs` is an opponent id and `side` is the
 * colour the human plays, or `both` for two players on one device — which
 * is what a given position gets, so nobody replies before the position has
 * been looked at, and for the same reason a position is never put on a
 * clock. Anything missing or malformed falls back to `prefs`, the game the
 * player set up last; a bad `pos` is reported on the console rather than
 * left to fail silently. `db=off` keeps the endgame tables out of the
 * worker, which is how the same position is compared with and without
 * them.
 */
export function startFromQuery(
  search: string,
  prefs: GamePrefs = defaultPrefs,
  rng: () => number = Math.random,
): Start {
  const params = new URLSearchParams(search)
  const position = positionOf(params.get('pos'))
  const side = colorOf(params.get('side'))
  const opponentId = opponentOf(params.get('vs'))
  const endgameDb = params.get('db') !== 'off'
  if (position === null && side === null && opponentId === null) {
    return {
      setup: setupFrom(prefs, rng),
      position: null,
      colorChoice: prefs.color,
      endgameDb,
    }
  }
  const wanted: GamePrefs = {
    opponentId:
      opponentId ?? (position === null ? prefs.opponentId : FRIEND_ID),
    color: side === 'both' || side === null ? prefs.color : side,
    timeControlId: position === null ? prefs.timeControlId : 'none',
  }
  // `setupFrom` is the one place that knows a human opponent means both
  // colours and a computer one a single colour, so the query is resolved
  // into preferences and handed to it whole. `side=both` is the exception
  // it cannot express: an explicit ask for two players, whoever the
  // opponent is.
  const setup = setupFrom(wanted, rng)
  return {
    setup: side === 'both' ? { ...setup, humanColor: 'both' } : setup,
    position,
    colorChoice: wanted.color,
    endgameDb,
  }
}

function positionOf(literal: string | null): Position | null {
  if (literal === null || literal === '') return null
  try {
    return fromBitPosition(parsePos(literal))
  } catch (error) {
    console.error('ignoring ?pos', error)
    return null
  }
}

function colorOf(value: string | null): Color | 'both' | null {
  return COLORS.find((color) => color === value) ?? null
}

function opponentOf(value: string | null): OpponentId | null {
  return opponents.find((o) => o.id === value)?.id ?? null
}
