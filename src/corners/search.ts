/**
 * Alpha-beta search for уголки: negamax, fail-soft, principal variation
 * search, iterative deepening, a transposition table and move ordering.
 * The shape is the checkers search's with everything the race does not
 * have taken out: no captures, so no quiescence search; no endgame
 * tables; no repetition rule, since the ply count is part of the position
 * and the blocking limits end every game.
 *
 * The position lives on the loaded board (`board.ts`) and moves are made
 * and unmade in place; the ply count of the game is the root's plus the
 * search ply. Rules of the tree:
 *
 * - a finished position (`statusOf`) scores the mate band for the ply it
 *   is reached at, so a shorter finish beats a longer one and a longer
 *   loss beats a shorter one; a draw scores `DRAW_SCORE`;
 * - a side without a move has lost;
 * - a leaf is evaluated; `MAX_PLY` is a safety net.
 *
 * Ordering: the table move, then two killers per ply, then the ground a
 * move gains with history behind it.
 *
 * Root: iterations 1, 2, 3, … up to `limits.depth` or the time budget.
 * Every root move is searched against `alpha = best - margin - 1`, so
 * moves within `margin` of the best get exact scores and the rest an
 * upper bound; the persona layer picks among the exact ones. The result
 * has the layout of the checkers root, `[move, 0, score, bound]` per
 * move, so `pickRoot` reads both. On a time abort the last completed
 * iteration stands and nothing is stored after the abort.
 */
import { ROOT_SLOTS } from '../engine/search.ts'
import {
  DRAW_SCORE,
  INF,
  MAX_PLY,
  matedScore,
  matingScore,
} from '../engine/score.ts'
import { DRAW, ONGOING, WHITE_WINS } from '../engine/status.ts'
import type { Position } from '../game/types.ts'
import { make, moveFrom, moveTo, unmake } from './apply.ts'
import { WHITE, load } from './board.ts'
import { COST, evaluate } from './eval.ts'
import { MAX_MOVES, generate } from './movegen.ts'
import { statusOf } from './status.ts'
import {
  EXACT,
  LOWER,
  UPPER,
  metaOf,
  scoreFromTT,
  scoreToTT,
  ttDepth,
  ttFlag,
  ttIndex,
  ttMatches,
  ttMove,
  ttNewGeneration,
  ttScore,
  ttStore,
} from './tt.ts'

export type Limits = {
  /** Cap on the search depth in plies. */
  readonly depth: number
  /** Time budget; 0 means fixed depth, fully deterministic. */
  readonly budgetMs: number
  /** Root moves within this many points of the best get exact scores. */
  readonly margin: number
}

export type SearchResult = {
  /** Best packed move. */
  readonly move: number
  /** Score of the best move from the side to move. */
  readonly score: number
  /** Depth of the last completed iteration. */
  readonly depth: number
  readonly nodes: number
  /** `[move, 0, score, bound]` per root move, best first. */
  readonly root: Int32Array
}

export type SearchStats = {
  readonly nodes: number
  readonly ttProbes: number
  readonly ttHits: number
}

/** One move-list region per ply 0..MAX_PLY-1; ply MAX_PLY generates nothing. */
const STACK = new Int32Array(MAX_PLY * MAX_MOVES)
/** Ordering score per move, parallel to `STACK`. */
const ORDER = new Int32Array(MAX_PLY * MAX_MOVES)
/** Two killer moves per ply. */
const KILLERS = new Int32Array(MAX_PLY * 2)
/** Quiet-move history by packed move. */
const HISTORY = new Int32Array(4096)
const HISTORY_LIMIT = 1 << 19

const ORDER_TT = 1 << 30
const ORDER_KILLER = 1 << 20
/** Ground gained weighs this much against history in the ordering. */
const ORDER_GAIN = 16
const TIME_CHECK_MASK = 2047

/* Root bookkeeping: the current iteration and the last completed one. */
const ROOT_IDX = new Int32Array(MAX_MOVES)
const ROOT_SCORE = new Int32Array(MAX_MOVES)
const ROOT_BOUND = new Int32Array(MAX_MOVES)
const DONE_IDX = new Int32Array(MAX_MOVES)
const DONE_SCORE = new Int32Array(MAX_MOVES)
const DONE_BOUND = new Int32Array(MAX_MOVES)

/** Plies played at the root; the ply count of a node is this plus its ply. */
let played = 0
let nodes = 0
let ttProbes = 0
let ttHits = 0
let aborted = false
let canAbort = false
let deadline = 0

/** Counters of the last `search` call. */
export function searchStats(): SearchStats {
  return { nodes, ttProbes, ttHits }
}

export function search(position: Position, limits: Limits): SearchResult {
  load(position)
  const side = position.toMove === 'white' ? 0 : 1
  played = position.ply
  nodes = 0
  ttProbes = 0
  ttHits = 0
  aborted = false
  canAbort = false
  deadline = limits.budgetMs > 0 ? performance.now() + limits.budgetMs : 0
  ttNewGeneration()
  KILLERS.fill(0)
  HISTORY.fill(0)

  // A finished game offers no move, exactly as `status` reports it at the
  // UI boundary.
  const status = statusOf(side, played)
  const count = status === ONGOING ? generate(side, STACK, 0) : 0
  if (status !== ONGOING || count === 0) {
    const root = new Int32Array(0)
    const score =
      status === ONGOING ? matedScore(0) : terminalScore(status, side, 0)
    return { move: 0, score, depth: 0, nodes, root }
  }
  for (let i = 0; i < count; i++) ROOT_IDX[i] = i

  let doneDepth = 0
  const margin = limits.margin
  // Under a time budget a single legal move is played after one iteration
  // rather than after the whole budget; a fixed-depth request keeps its
  // depth. The cap keeps depth in the table's eight bits and always
  // completes at least one iteration.
  const maxDepth =
    count === 1 && limits.budgetMs > 0
      ? 1
      : Math.min(MAX_PLY, Math.max(1, limits.depth))
  for (let depth = 1; depth <= maxDepth; depth++) {
    rootSearch(side, count, depth - 1, margin)
    if (aborted) break
    // The iteration is complete: keep it, then order the moves for the next.
    doneDepth = depth
    canAbort = limits.budgetMs > 0
    sortRoot(count)
    for (let i = 0; i < count; i++) {
      DONE_IDX[i] = ROOT_IDX[i]!
      DONE_SCORE[i] = ROOT_SCORE[i]!
      DONE_BOUND[i] = ROOT_BOUND[i]!
    }
  }

  const root = new Int32Array(count * ROOT_SLOTS)
  for (let k = 0; k < count; k++) {
    const idx = DONE_IDX[k]!
    const slot = k * ROOT_SLOTS
    root[slot] = STACK[idx]!
    root[slot + 1] = 0
    root[slot + 2] = DONE_SCORE[idx]!
    root[slot + 3] = DONE_BOUND[idx]!
  }
  return {
    move: root[0]!,
    score: root[2]!,
    depth: doneDepth,
    nodes,
    root,
  }
}

/** One root pass in `ROOT_IDX` order with a full window. */
function rootSearch(
  side: number,
  count: number,
  childDepth: number,
  margin: number,
): void {
  let best = -INF
  for (let k = 0; k < count; k++) {
    const idx = ROOT_IDX[k]!
    const move = STACK[idx]!
    make(move, side)
    // `0 - x`, not `-x`: negating a zero score would give -0, a heap number.
    let score: number
    let low: number
    if (k === 0) {
      low = -INF
      score = 0 - negamax(side ^ 1, childDepth, 1, -INF, INF)
    } else {
      low = best - margin - 1
      score = 0 - negamax(side ^ 1, childDepth, 1, -low - 1, -low)
      if (!aborted && score > low) {
        score = 0 - negamax(side ^ 1, childDepth, 1, -INF, -low)
      }
    }
    unmake(move, side)
    if (aborted) return
    ROOT_SCORE[idx] = score
    ROOT_BOUND[idx] = score > low ? EXACT : UPPER
    if (score > best) best = score
  }
}

/** Stable insertion sort of `ROOT_IDX` by score, best first. */
function sortRoot(count: number): void {
  for (let i = 1; i < count; i++) {
    const idx = ROOT_IDX[i]!
    const score = ROOT_SCORE[idx]!
    let j = i - 1
    while (j >= 0 && ROOT_SCORE[ROOT_IDX[j]!]! < score) {
      ROOT_IDX[j + 1] = ROOT_IDX[j]!
      j--
    }
    ROOT_IDX[j + 1] = idx
  }
}

function negamax(
  side: number,
  depth: number,
  ply: number,
  alpha: number,
  beta: number,
): number {
  nodes++
  if (canAbort && (nodes & TIME_CHECK_MASK) === 0) {
    if (performance.now() >= deadline) aborted = true
  }
  if (aborted) return 0
  const status = statusOf(side, played + ply)
  if (status !== ONGOING) return terminalScore(status, side, ply)
  if (depth <= 0 || ply >= MAX_PLY) return evaluate(side)

  const meta = metaOf(side, played + ply)
  const entry = ttIndex(meta)
  let ttM = 0
  ttProbes++
  if (ttMatches(entry, meta)) {
    ttHits++
    ttM = ttMove(entry)
    if (ttDepth(entry) >= depth) {
      const score = scoreFromTT(ttScore(entry), ply)
      const flag = ttFlag(entry)
      if (flag === EXACT) return score
      if (flag === LOWER && score >= beta) return score
      if (flag === UPPER && score <= alpha) return score
    }
  }

  const base = ply * MAX_MOVES
  const count = generate(side, STACK, base)
  if (count === 0) return matedScore(ply)
  orderMoves(base, count, ply, side, ttM)

  const origAlpha = alpha
  let best = -INF
  let bestMove = 0
  for (let i = 0; i < count; i++) {
    pickMove(base, count, i)
    const move = STACK[base + i]!
    make(move, side)
    let score: number
    if (i === 0) {
      score = 0 - negamax(side ^ 1, depth - 1, ply + 1, -beta, -alpha)
    } else {
      score = 0 - negamax(side ^ 1, depth - 1, ply + 1, -alpha - 1, -alpha)
      if (!aborted && score > alpha && score < beta) {
        score = 0 - negamax(side ^ 1, depth - 1, ply + 1, -beta, -alpha)
      }
    }
    unmake(move, side)
    if (aborted) return 0
    if (score > best) {
      best = score
      bestMove = move
      if (score > alpha) {
        alpha = score
        if (alpha >= beta) {
          reward(ply, move, depth)
          break
        }
      }
    }
  }

  const flag = best <= origAlpha ? UPPER : best >= beta ? LOWER : EXACT
  ttStore(entry, meta, depth, flag, scoreToTT(best, ply), bestMove)
  return best
}

/**
 * Score of a finished position for `side`, to move, at `ply`: the win or
 * the loss it is for that side, or the draw.
 */
function terminalScore(status: number, side: number, ply: number): number {
  if (status === DRAW) return DRAW_SCORE
  const whiteWon = status === WHITE_WINS
  return (side === WHITE) === whiteWon ? matingScore(ply) : matedScore(ply)
}

function orderMoves(
  base: number,
  count: number,
  ply: number,
  side: number,
  ttM: number,
): void {
  const costs = side * 64
  const killerBase = ply * 2
  for (let i = 0; i < count; i++) {
    const move = STACK[base + i]!
    let score: number
    if (move === ttM) {
      score = ORDER_TT
    } else if (move === KILLERS[killerBase]) {
      score = ORDER_KILLER * 2
    } else if (move === KILLERS[killerBase + 1]) {
      score = ORDER_KILLER
    } else {
      // Ground gained: the cost the man sheds by moving. A jump chain
      // across the board goes first, a step back last.
      const gain = COST[costs + moveFrom(move)]! - COST[costs + moveTo(move)]!
      score = gain * ORDER_GAIN + HISTORY[move]!
    }
    ORDER[base + i] = score
  }
}

/** Swaps the best remaining move into position `i` (selection, lazily). */
function pickMove(base: number, count: number, i: number): void {
  let bestJ = i
  let bestScore = ORDER[base + i]!
  for (let j = i + 1; j < count; j++) {
    const s = ORDER[base + j]!
    if (s > bestScore) {
      bestScore = s
      bestJ = j
    }
  }
  if (bestJ === i) return
  ORDER[base + bestJ] = ORDER[base + i]!
  ORDER[base + i] = bestScore
  const move = STACK[base + i]!
  STACK[base + i] = STACK[base + bestJ]!
  STACK[base + bestJ] = move
}

/** A move that cut off: killers of this ply and history. */
function reward(ply: number, move: number, depth: number): void {
  const killerBase = ply * 2
  if (move !== KILLERS[killerBase]) {
    KILLERS[killerBase + 1] = KILLERS[killerBase]!
    KILLERS[killerBase] = move
  }
  const value = HISTORY[move]! + depth * depth
  HISTORY[move] = value
  if (value > HISTORY_LIMIT) {
    for (let i = 0; i < HISTORY.length; i++) HISTORY[i] = HISTORY[i]! >> 1
  }
}
