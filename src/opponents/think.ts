/**
 * One computer move: search the position with the persona's limits, pick
 * among the root moves within the margin, and return the move in UI form.
 * Pure and synchronous, so it runs the same inside a worker, in tests and
 * in the self-play tournament.
 */
import type { Move } from '../game/types.ts'
import { detailedOf } from '../engine/adapter.ts'
import { dbLimit } from '../engine/db.ts'
import { parsePos } from '../engine/position.ts'
import { DRAW_SCORE } from '../engine/score.ts'
import { createRng } from '../engine/random.ts'
import { ROOT_SLOTS, search } from '../engine/search.ts'
import { EXACT } from '../engine/tt.ts'
import { cappedMs } from './limits.ts'
import { personas } from './personas.ts'
import type { Persona, PersonaId } from './personas.ts'

export type ThinkRequest = {
  readonly id: number
  /** Engine position literal, e.g. `W:Wa1,Kc3:Bf6,Kh8:12`. */
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
}

/** Posted by the worker when `think` throws (never for a live game). */
export type ThinkFailure = {
  readonly id: number
  readonly error: string
}

export function think(request: ThinkRequest): ThinkResponse {
  return thinkWith(request, personas[request.persona])
}

export function thinkWith(
  request: ThinkRequest,
  persona: Persona,
): ThinkResponse {
  const start = performance.now()
  const p = parsePos(request.position)
  // What this persona is allowed to look up; the tables are shared, the
  // permission is not.
  dbLimit(persona.endgamePieces)
  const result = search(p.white, p.black, p.kings, p.side, p.plies, {
    depth: persona.depth,
    budgetMs: cappedMs(persona.budgetMs, request.budgetMs),
    margin: persona.margin,
  })
  if (result.root.length === 0) {
    const why =
      result.score === DRAW_SCORE ? 'drawn position' : 'no legal moves in'
    throw new Error(`${why} ${request.position}`)
  }
  const slot = pickRoot(
    result.root,
    persona.margin,
    persona.temperature,
    createRng(request.seed),
  )
  const move = detailedOf(p, result.root[slot]!, result.root[slot + 1]!)
  return {
    id: request.id,
    move,
    score: result.root[slot + 2]!,
    depth: result.depth,
    nodes: result.nodes,
    ms: Math.round(performance.now() - start),
  }
}

/**
 * Slot of the chosen entry in a `SearchResult.root` (best first). The
 * candidates are the moves with an exact score within `margin` of the
 * best; the pick is a softmax over their scores with `temperature`, so a
 * move `temperature` points behind is about e times less likely.
 */
export function pickRoot(
  root: Int32Array,
  margin: number,
  temperature: number,
  rng: () => number,
): number {
  const best = root[2]!
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
