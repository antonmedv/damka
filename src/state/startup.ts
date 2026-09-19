import { parseCorners } from '../corners/position.ts'
import { fromBitPosition } from '../engine/adapter.ts'
import { parsePos } from '../engine/position.ts'
import { gameVariants } from '../game/types.ts'
import type { Color, GameVariant, Position } from '../game/types.ts'
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
 *     ?game=giveaway&vs=owl&side=black
 *     ?game=corners&pos=W:Wa1,b1:Bh8,g8
 *
 * `game` is `checkers` (the default), `giveaway` or `corners`, which is
 * how поддавки and уголки are opened straight from a link. `pos` is the
 * position literal of the game's engine: `parsePos` for checkers (side
 * to move, white pieces, black pieces, `K` for a king), `parseCorners`
 * for уголки. The two literals are not interchangeable, so a `pos` that
 * names no game is a checkers one, and it opens the checkers game the
 * player set up last - never уголки, whatever was played last. `vs` is an
 * opponent id and `side` is the
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
  const variant = variantOf(params.get('game'))
  const literal = params.get('pos')
  // The game a literal is read in, and then played: the one named, or the
  // remembered one if that is a checkers game.
  const literalGame =
    variant ?? (prefs.variant === 'corners' ? 'checkers' : prefs.variant)
  const position = positionOf(literal, literalGame)
  const side = colorOf(params.get('side'))
  const opponentId = opponentOf(params.get('vs'))
  const endgameDb = params.get('db') !== 'off'
  if (
    position === null &&
    side === null &&
    opponentId === null &&
    variant === null
  ) {
    return {
      setup: setupFrom(prefs, rng),
      position: null,
      colorChoice: prefs.color,
      endgameDb,
    }
  }
  const wanted: GamePrefs = {
    variant: position === null ? (variant ?? prefs.variant) : literalGame,
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

/** The literal read by the rules of `variant`, since the two differ. */
function positionOf(
  literal: string | null,
  variant: GameVariant,
): Position | null {
  if (literal === null || literal === '') return null
  try {
    return variant === 'corners'
      ? parseCorners(literal)
      : fromBitPosition(parsePos(literal))
  } catch (error) {
    console.error('ignoring ?pos', error)
    return null
  }
}

function variantOf(value: string | null): GameVariant | null {
  return gameVariants.find((v) => v === value) ?? null
}

function colorOf(value: string | null): Color | 'both' | null {
  return COLORS.find((color) => color === value) ?? null
}

function opponentOf(value: string | null): OpponentId | null {
  return opponents.find((o) => o.id === value)?.id ?? null
}
