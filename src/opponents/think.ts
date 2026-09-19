/**
 * One computer move: search the position with the persona's limits, pick
 * among the root moves within the margin, and return the move in UI form.
 * Pure and synchronous, so it runs the same inside a worker, in tests and
 * in the self-play tournament.
 *
 * Two engines answer here, the checkers one for шашки and поддавки and the
 * уголки one, and the request says which. Both hand back a root in the
 * same layout, so the pick is one function.
 */
import { detailedOf as cornersDetailedOf } from '../corners/movegen.ts'
import { parseCorners } from '../corners/position.ts'
import { search as searchCorners } from '../corners/search.ts'
import type { Limits } from '../corners/search.ts'
import type { GameVariant, Move } from '../game/types.ts'
import { detailedOf, toVariant } from '../engine/adapter.ts'
import { dbLimit } from '../engine/db.ts'
import { parsePos } from '../engine/position.ts'
import { DRAW_SCORE, isMateScore } from '../engine/score.ts'
import { createRng } from '../engine/random.ts'
import { ROOT_SLOTS, search } from '../engine/search.ts'
import { EXACT } from '../engine/tt.ts'
import { GIVEAWAY } from '../engine/variant.ts'
import { cappedMs } from './limits.ts'
import { personas } from './personas.ts'
import type { Persona, PersonaId } from './personas.ts'

export type ThinkRequest = {
  readonly id: number
  /** Which game to search; the personas play all three. */
  readonly variant: GameVariant
  /**
   * Position literal of the game's engine: `W:Wa1,Kc3:Bf6,Kh8:12` for
   * checkers (`parsePos`), `W:Wa1,b1:Bh8,g8:12` for уголки
   * (`parseCorners`).
   */
  readonly position: string
  readonly persona: PersonaId
  readonly seed: number
  /**
   * Caps from the caller's own clock, if it has one. They only ever lower
   * the persona's limits: whichever of the two is shorter wins, so a
   * shallow test thinker and a nearly empty bank both still apply.
   */
  readonly budgetMs?: number
  readonly minThinkMs?: number
}

export type ThinkResponse = {
  readonly id: number
  readonly move: Move
  /** Score of the chosen move from the mover's side. */
  readonly score: number
  readonly depth: number
  readonly nodes: number
  readonly ms: number
}

/**
 * Sent to the worker once, before any request: what it should get ready.
 * Kept apart from `ThinkRequest` by the field, so the worker can tell the
 * two messages apart without a tag on every search.
 */
export type ThinkConfig = {
  /** Whether to fetch the endgame tables at all; `?db=off` says no. */
  readonly endgameDb: boolean
  /**
   * The game the session opens on. Only checkers reads the tables, so a
   * session that opens on another game does not fetch them up front
   * either; if a game of checkers is started later, the worker starts
   * them then.
   */
  readonly variant: GameVariant
}

/** Posted by the worker when `think` throws (never for a live game). */
export type ThinkFailure = {
  readonly id: number
  readonly error: string
}

export function think(request: ThinkRequest): ThinkResponse {
  return thinkWith(request, personas[request.persona])
}

/**
 * What a search left for the pick: the root in `pickRoot`'s layout, the
 * depth and node count, and how to read the move in a root slot.
 */
type Searched = {
  readonly root: Int32Array
  readonly score: number
  readonly depth: number
  readonly nodes: number
  readonly moveAt: (slot: number) => Move
}

export function thinkWith(
  request: ThinkRequest,
  persona: Persona,
): ThinkResponse {
  const start = performance.now()
  const limits = {
    depth: persona.depth,
    budgetMs: cappedMs(persona.budgetMs, request.budgetMs),
    margin: persona.margin,
  }
  const searched =
    request.variant === 'corners'
      ? cornersSearch(request, limits)
      : checkersSearch(request, persona, limits)
  // Nothing to play: the rules have ended the game here, by a draw or by
  // a decision — a side with no move has lost or, at поддавки, won, and an
  // уголки race may be over before anyone is stuck.
  if (searched.root.length === 0) {
    const why = searched.score === DRAW_SCORE ? 'drawn' : 'decided'
    throw new Error(`${why} position ${request.position}`)
  }
  const slot = pickRoot(
    searched.root,
    persona.margin,
    persona.temperature,
    createRng(request.seed),
  )
  return {
    id: request.id,
    move: searched.moveAt(slot),
    score: searched.root[slot + 2]!,
    depth: searched.depth,
    nodes: searched.nodes,
    ms: Math.round(performance.now() - start),
  }
}

/**
 * The persona's limits are the уголки search's limits as they are; the
 * checkers search takes the same three and the variant besides.
 */
function checkersSearch(
  request: ThinkRequest,
  persona: Persona,
  limits: Limits,
): Searched {
  const p = parsePos(request.position)
  const variant = toVariant(request.variant)
  // What this persona is allowed to look up; the tables are shared, the
  // permission is not. поддавки looks up nothing at all: the tables hold
  // checkers values, which are not the values of that game.
  dbLimit(variant === GIVEAWAY ? 0 : persona.endgamePieces)
  const result = search(p.white, p.black, p.kings, p.side, p.plies, {
    variant,
    ...limits,
  })
  return {
    ...result,
    moveAt: (slot) => detailedOf(p, result.root[slot]!, result.root[slot + 1]!),
  }
}

function cornersSearch(request: ThinkRequest, limits: Limits): Searched {
  const position = parseCorners(request.position)
  const result = searchCorners(position, limits)
  return {
    ...result,
    moveAt: (slot) => cornersDetailedOf(position, result.root[slot]!),
  }
}

/**
 * Slot of the chosen entry in a `SearchResult.root` (best first). The
 * candidates are the moves with an exact score within `margin` of the
 * best; the pick is a softmax over their scores with `temperature`, so a
 * move `temperature` points behind is about e times less likely.
 *
 * A decided game is played straight. When the best score is a mate score
 * (`engine/score.ts`; both engines use the band) the margin is skipped
 * and slot 0 is played: the shortest win, or the longest defence when
 * every move loses. Mate scores differ by a point per ply, so any margin
 * above zero would blur a win in three with a win in five, and a persona
 * would put the finish off at random - a king declining the last capture
 * at шашки, a man strolling inside a filled target at уголки. The win was
 * never at risk and which positions are won does not change; only kitten,
 * hare and fox, the personas with a margin, play differently.
 */
export function pickRoot(
  root: Int32Array,
  margin: number,
  temperature: number,
  rng: () => number,
): number {
  const best = root[2]!
  if (isMateScore(best)) return 0
  const slots: number[] = []
  const weights: number[] = []
  let total = 0
  for (let slot = 0; slot < root.length; slot += ROOT_SLOTS) {
    const score = root[slot + 2]!
    if (root[slot + 3] !== EXACT || score < best - margin) continue
    const weight = temperature > 0 ? Math.exp((score - best) / temperature) : 1
    slots.push(slot)
    weights.push(weight)
    total += weight
  }
  if (slots.length <= 1) return slots[0] ?? 0
  let roll = rng() * total
  for (let i = 0; i < slots.length; i++) {
    roll -= weights[i]!
    if (roll < 0) return slots[i]!
  }
  return slots[slots.length - 1]!
}
