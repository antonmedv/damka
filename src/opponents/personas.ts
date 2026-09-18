/**
 * Search parameters of the computer opponents. The evaluation knows
 * nothing about personas; strength differences live only here: how deep
 * or long the search runs, how far from the best move the pick may stray,
 * and how much endgame the persona has been taught. Numbers are starting
 * points, checked by `npm run selfplay`.
 *
 * One table serves both games. The ladder was measured again at поддавки
 * rather than assumed to carry over; see `tasks/todo.md`.
 */
import type { OpponentId } from './opponents.ts'

export type PersonaId = Exclude<OpponentId, 'friend'>

export type Persona = {
  /** Cap on the search depth in plies. */
  readonly depth: number
  /** Time budget per move. */
  readonly budgetMs: number
  /** Root moves within this many points of the best are candidates. */
  readonly margin: number
  /** Softmax temperature over candidate scores; moot when margin is 0. */
  readonly temperature: number
  /** Never answer faster than this; an instant reply feels wrong. */
  readonly minThinkMs: number
  /**
   * Pieces at or below which the persona may read the endgame tables. The
   * tables are exact, so without a cap a kitten that blunders its way
   * through the middlegame would convert every ending like a machine -
   * the strongest endgame play in the game, from the weakest opponent.
   * The cap keeps the ladder in one piece: a beginner mishandles endings
   * too, and only the birds of prey know them cold.
   *
   * Moot at поддавки, where nobody reads them: they hold checkers win and
   * loss values, which are not that game's.
   */
  readonly endgamePieces: number
}

export const personas: Readonly<Record<PersonaId, Persona>> = {
  kitten: {
    depth: 2,
    budgetMs: 100,
    margin: 400,
    temperature: 250,
    minThinkMs: 250,
    endgamePieces: 0,
  },
  hare: {
    depth: 4,
    budgetMs: 200,
    margin: 150,
    temperature: 60,
    minThinkMs: 300,
    // A lone king against a lone king, and little more.
    endgamePieces: 3,
  },
  fox: {
    depth: 64,
    budgetMs: 500,
    margin: 30,
    temperature: 15,
    minThinkMs: 400,
    endgamePieces: 5,
  },
  owl: {
    depth: 64,
    budgetMs: 1500,
    margin: 0,
    temperature: 1,
    minThinkMs: 500,
    endgamePieces: 5,
  },
  raven: {
    depth: 64,
    budgetMs: 3000,
    margin: 0,
    temperature: 0,
    minThinkMs: 500,
    endgamePieces: 5,
  },
}

export const personaIds: ReadonlyArray<PersonaId> = [
  'kitten',
  'hare',
  'fox',
  'owl',
  'raven',
]

export function isPersonaId(id: string): id is PersonaId {
  return (personaIds as ReadonlyArray<string>).includes(id)
}

/**
 * Plies a persona assumes it still has to play. Checkers games run longer
 * than this, but the bank is re-divided before every move, so the budget
 * tapers instead of running out.
 */
const MOVES_LEFT = 40
/** Time the search must leave on the clock for the move to be received. */
const SAFETY_MS = 150
/** Even in a lost-on-time position the search has to return something. */
const MIN_BUDGET_MS = 20

/** The search limits a persona may use with this much time left. */
export type ClockLimits = {
  readonly budgetMs: number
  readonly minThinkMs: number
}

/**
 * How long the persona may think with `remainingMs` on its own clock. It
 * never spends more than its usual budget, never more than its share of
 * what is left, and always leaves enough to deliver the move. The
 * "never answer instantly" delay shrinks with the budget: in a one-minute
 * game a considered pause would itself lose the game.
 */
export function budgetFor(
  persona: Persona,
  remainingMs: number,
  incrementMs: number,
): ClockLimits {
  const share = remainingMs / MOVES_LEFT + incrementMs * 0.8
  const spendable = Math.max(MIN_BUDGET_MS, remainingMs - SAFETY_MS)
  const budgetMs = Math.max(
    MIN_BUDGET_MS,
    Math.min(persona.budgetMs, share, spendable),
  )
  return { budgetMs, minThinkMs: Math.min(persona.minThinkMs, budgetMs) }
}
