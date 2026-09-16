/**
 * Alpha-beta search (negamax, fail-soft, principal variation search) over
 * the bitboard engine, with iterative deepening, aspiration windows, a
 * transposition table and move ordering.
 *
 * The position travels as int locals, like `perft`; move lists live in
 * ply-indexed regions of one `Int32Array`. Rules of the tree:
 *
 * - a side without moves has lost, checked before the 30-ply draw
 *   (`statusOf`); a loss at ply `p` scores `matedScore(p)`;
 * - a position repeated on the current search path scores a draw. This is
 *   a search heuristic only: the game rules (and the Go reference) know
 *   just the 30-ply rule, under which a king shuffle is drawn anyway. It
 *   stays because it cuts about a tenth of the nodes in king endgames and
 *   costs nothing elsewhere: a repetition needs quiet king moves
 *   throughout, so only the last `plies` plies of the path are compared;
 * - captures are never evaluated: at `depth <= 0` every capture is still
 *   searched (the quiescence search), with no stand-pat because the
 *   capture is mandatory; it ends by itself since material shrinks. One
 *   complete multi-jump is one ply. All capture-only nodes at `depth <= 0`
 *   search the same tree, so they share depth 0 in the table;
 * - a single legal quiet move costs no depth. There is no quota (so a
 *   table entry never depends on the path); the other side spends depth,
 *   and a sequence forced for both sides ends by repetition, an
 *   irreversible man move, or the `MAX_PLY` safety net, where a node is
 *   evaluated before anything is generated.
 *
 * Ordering: the table move, then captures by promotion, captured kings
 * and count, then two killers per ply, then history for quiet moves.
 *
 * Root: iterations 1, 2, 3, … up to `limits.depth` or the time budget,
 * with an aspiration window around the previous score from depth 4. Every
 * root move is searched against `alpha = best - margin - 1`, so moves
 * within `margin` of the best get exact scores and the rest an upper
 * bound; the persona layer picks among the exact ones. On a time abort the
 * last completed iteration stands, except that a move which finished a
 * full-window re-search with a higher exact score than the previous best
 * in the aborted iteration is played instead (both were measured at the
 * same depth). Nothing is stored in the table after the abort.
 */
import { APPLIED, makeMove } from './apply.ts'
import { popcount } from './bitboard.ts'
import { evaluate } from './eval.ts'
import { moveCaptureCount, movePromotes } from './move.ts'
import { MAX_MOVES, MOVE_SLOTS, generate } from './movegen.ts'
import { DRAW_SCORE, INF, MAX_PLY, isMateScore, matedScore } from './score.ts'
import { DRAW, ONGOING, statusOf } from './status.ts'
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
  ttMove0,
  ttMove1,
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
  readonly m0: number
  readonly m1: number
  /** Score of the best move from the side to move. */
  readonly score: number
  /** Depth of the last completed iteration. */
  readonly depth: number
  readonly nodes: number
  /** `[m0, m1, score, bound]` per root move, best first. */
  readonly root: Int32Array
}

export type SearchStats = {
  readonly nodes: number
  readonly ttProbes: number
  readonly ttHits: number
}

export const ROOT_SLOTS = 4

const REGION = MAX_MOVES * MOVE_SLOTS
/** One move-list region per ply 0..MAX_PLY-1; ply MAX_PLY generates nothing. */
const STACK = new Int32Array(MAX_PLY * REGION)
/** Ordering score per move, parallel to `STACK`. */
const ORDER = new Int32Array(MAX_PLY * MAX_MOVES)
/** Position words of every node on the current path, three per ply. */
const PATH = new Int32Array(MAX_PLY * 3)
/** Two killer moves per ply: m0, m1, m0, m1. */
const KILLERS = new Int32Array(MAX_PLY * 4)
/** Quiet-move history by `from | to << 5`. */
const HISTORY = new Int32Array(1024)
const HISTORY_LIMIT = 1 << 19

const ORDER_TT = 1 << 30
const ORDER_KILLER = 1 << 20
const ASPIRATION = [100, 250, 600]
const ASPIRATION_FROM = 4
const TIME_CHECK_MASK = 2047

/* Root bookkeeping: the current iteration and the last completed one. */
const ROOT_IDX = new Int32Array(MAX_MOVES)
const ROOT_SCORE = new Int32Array(MAX_MOVES)
const ROOT_BOUND = new Int32Array(MAX_MOVES)
const DONE_IDX = new Int32Array(MAX_MOVES)
const DONE_SCORE = new Int32Array(MAX_MOVES)
const DONE_BOUND = new Int32Array(MAX_MOVES)

let nodes = 0
let ttProbes = 0
let ttHits = 0
let aborted = false
let canAbort = false
let deadline = 0
/* A new best found in the iteration that was aborted (see the header). */
let hasNew = false
let newM0 = 0
let newM1 = 0
let newScore = 0

/** Counters of the last `search` call. */
export function searchStats(): SearchStats {
  return { nodes, ttProbes, ttHits }
}

export function search(
  white: number,
  black: number,
  kings: number,
  side: number,
  plies: number,
  limits: Limits,
): SearchResult {
  nodes = 0
  ttProbes = 0
  ttHits = 0
  aborted = false
  canAbort = false
  hasNew = false
  deadline = limits.budgetMs > 0 ? performance.now() + limits.budgetMs : 0
  ttNewGeneration()
  KILLERS.fill(0)
  HISTORY.fill(0)

  // A finished game offers no move: lost without moves, or drawn by the
  // 30-ply rule, exactly as `status` reports it at the UI boundary.
  const count = generate(white, black, kings, side, STACK, 0)
  const status = statusOf(count, side, plies)
  if (status !== ONGOING) {
    const root = new Int32Array(0)
    const score = status === DRAW ? DRAW_SCORE : matedScore(0)
    return { m0: 0, m1: 0, score, depth: 0, nodes, root }
  }
  for (let i = 0; i < count; i++) ROOT_IDX[i] = i
  PATH[0] = white
  PATH[1] = black
  PATH[2] = kings
  const captures = STACK[1] !== 0

  let doneDepth = 0
  let prev = 0
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
    const childDepth = count === 1 && !captures ? depth : depth - 1
    let alpha = -INF
    let beta = INF
    let lo = 0
    let hi = 0
    if (depth >= ASPIRATION_FROM && !isMateScore(prev)) {
      alpha = lowEdge(prev, ASPIRATION[0]!, margin)
      beta = prev + ASPIRATION[0]!
    }
    let best = -INF
    for (;;) {
      best = rootSearch(
        white,
        black,
        kings,
        side,
        plies,
        count,
        childDepth,
        alpha,
        beta,
        margin,
      )
      if (aborted) break
      if (best <= alpha && alpha > -INF) {
        lo++
        alpha =
          lo < ASPIRATION.length ? lowEdge(prev, ASPIRATION[lo]!, margin) : -INF
      } else if (best >= beta && beta < INF) {
        hi++
        beta = hi < ASPIRATION.length ? prev + ASPIRATION[hi]! : INF
      } else {
        break
      }
    }
    if (aborted) break
    // The iteration is complete: keep it, then order the moves for the next.
    doneDepth = depth
    prev = best
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
    const at = idx * MOVE_SLOTS
    const slot = k * ROOT_SLOTS
    root[slot] = STACK[at]!
    root[slot + 1] = STACK[at + 1]!
    root[slot + 2] = DONE_SCORE[idx]!
    root[slot + 3] = DONE_BOUND[idx]!
  }
  if (aborted && hasNew) promoteNewBest(root, count)
  return {
    m0: root[0]!,
    m1: root[1]!,
    score: root[2]!,
    depth: doneDepth,
    nodes,
    root,
  }
}

/**
 * Low edge of the aspiration window. It never rises above
 * `prev - margin - 1`, so root moves within the margin keep their exact
 * scores even when the window is narrower than the margin.
 */
function lowEdge(prev: number, window: number, margin: number): number {
  return Math.max(-INF, prev - Math.max(window, margin + 1))
}

/**
 * The aborted iteration proved a later move better than the previous best
 * at the same depth: it goes to the front of `root` with its exact score,
 * so `root` stays the single source the persona layer reads.
 */
function promoteNewBest(root: Int32Array, count: number): void {
  let k = 0
  while (
    k < count &&
    (root[k * ROOT_SLOTS] !== newM0 || root[k * ROOT_SLOTS + 1] !== newM1)
  ) {
    k++
  }
  if (k >= count) return
  for (let slot = k * ROOT_SLOTS; slot > 0; slot -= ROOT_SLOTS) {
    for (let i = 0; i < ROOT_SLOTS; i++)
      root[slot + i] = root[slot - ROOT_SLOTS + i]!
  }
  root[0] = newM0
  root[1] = newM1
  root[2] = newScore
  root[3] = EXACT
}

/** One root pass in `ROOT_IDX` order; returns the best score (a bound on a fail). */
function rootSearch(
  white: number,
  black: number,
  kings: number,
  side: number,
  plies: number,
  count: number,
  childDepth: number,
  alpha: number,
  beta: number,
  margin: number,
): number {
  let best = -INF
  let firstScore = 0
  let firstExact = false
  hasNew = false
  for (let k = 0; k < count; k++) {
    const idx = ROOT_IDX[k]!
    const at = idx * MOVE_SLOTS
    const m0 = STACK[at]!
    const m1 = STACK[at + 1]!
    makeMove(white, black, kings, side, plies, m0, m1)
    const w = APPLIED[0]!
    const b = APPLIED[1]!
    const kk = APPLIED[2]!
    const p = APPLIED[3]!
    // `0 - x`, not `-x`: negating a zero score would give -0, a heap number.
    let score: number
    let low: number
    if (k === 0) {
      low = alpha
      score = 0 - negamax(w, b, kk, side ^ 1, p, childDepth, 1, -beta, -alpha)
    } else {
      low = Math.max(alpha, best - margin - 1)
      score = 0 - negamax(w, b, kk, side ^ 1, p, childDepth, 1, -low - 1, -low)
      if (!aborted && score > low && score < beta) {
        score = 0 - negamax(w, b, kk, side ^ 1, p, childDepth, 1, -beta, -low)
      }
    }
    if (aborted) return best
    const exact = score > low && score < beta
    ROOT_SCORE[idx] = score
    ROOT_BOUND[idx] = exact ? EXACT : score <= low ? UPPER : LOWER
    if (k === 0) {
      firstScore = score
      firstExact = exact
    } else if (exact && firstExact && score > firstScore) {
      if (!hasNew || score > newScore) {
        hasNew = true
        newM0 = m0
        newM1 = m1
        newScore = score
      }
    }
    if (score > best) best = score
    if (best >= beta) return best
  }
  return best
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
  white: number,
  black: number,
  kings: number,
  side: number,
  plies: number,
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
  if (ply >= MAX_PLY) return evaluate(white, black, kings, side)
  const base = ply * REGION
  const count = generate(white, black, kings, side, STACK, base)
  if (count === 0) return matedScore(ply)
  if (statusOf(count, side, plies) === DRAW) return DRAW_SCORE
  for (let k = ply - 2; k >= 0 && k >= ply - plies; k -= 2) {
    const at = k * 3
    if (
      PATH[at] === white &&
      PATH[at + 1] === black &&
      PATH[at + 2] === kings
    ) {
      return DRAW_SCORE
    }
  }
  const captures = STACK[base + 1] !== 0
  if (depth <= 0) {
    if (!captures) return evaluate(white, black, kings, side)
    depth = 0
  }

  const meta = metaOf(side, plies)
  const entry = ttIndex(white, black, kings, meta)
  let ttM0 = 0
  let ttM1 = 0
  ttProbes++
  if (ttMatches(entry, white, black, kings, meta)) {
    ttHits++
    ttM0 = ttMove0(entry)
    ttM1 = ttMove1(entry)
    if (ttDepth(entry) >= depth) {
      const score = scoreFromTT(ttScore(entry), ply)
      const flag = ttFlag(entry)
      if (flag === EXACT) return score
      if (flag === LOWER && score >= beta) return score
      if (flag === UPPER && score <= alpha) return score
    }
  }

  const here = ply * 3
  PATH[here] = white
  PATH[here + 1] = black
  PATH[here + 2] = kings
  const childDepth = count === 1 && !captures ? depth : depth - 1
  orderMoves(base, count, ply, captures, kings, ttM0, ttM1)

  const origAlpha = alpha
  let best = -INF
  let bestM0 = 0
  let bestM1 = 0
  const orderBase = ply * MAX_MOVES
  for (let i = 0; i < count; i++) {
    pickMove(base, orderBase, count, i)
    const at = base + i * MOVE_SLOTS
    const m0 = STACK[at]!
    const m1 = STACK[at + 1]!
    makeMove(white, black, kings, side, plies, m0, m1)
    const w = APPLIED[0]!
    const b = APPLIED[1]!
    const kk = APPLIED[2]!
    const p = APPLIED[3]!
    let score: number
    if (i === 0) {
      score =
        0 - negamax(w, b, kk, side ^ 1, p, childDepth, ply + 1, -beta, -alpha)
    } else {
      score =
        0 -
        negamax(w, b, kk, side ^ 1, p, childDepth, ply + 1, -alpha - 1, -alpha)
      if (!aborted && score > alpha && score < beta) {
        score =
          0 - negamax(w, b, kk, side ^ 1, p, childDepth, ply + 1, -beta, -alpha)
      }
    }
    if (aborted) return 0
    if (score > best) {
      best = score
      bestM0 = m0
      bestM1 = m1
      if (score > alpha) {
        alpha = score
        if (alpha >= beta) {
          if (!captures) rewardQuiet(ply, m0, m1, depth)
          break
        }
      }
    }
  }

  const flag = best <= origAlpha ? UPPER : best >= beta ? LOWER : EXACT
  ttStore(
    entry,
    white,
    black,
    kings,
    meta,
    depth,
    flag,
    scoreToTT(best, ply),
    bestM0,
    bestM1,
  )
  return best
}

function orderMoves(
  base: number,
  count: number,
  ply: number,
  captures: boolean,
  kings: number,
  ttM0: number,
  ttM1: number,
): void {
  const orderBase = ply * MAX_MOVES
  const killerBase = ply * 4
  for (let i = 0; i < count; i++) {
    const at = base + i * MOVE_SLOTS
    const m0 = STACK[at]!
    const m1 = STACK[at + 1]!
    let score: number
    if (m0 === ttM0 && m1 === ttM1) {
      score = ORDER_TT
    } else if (captures) {
      score =
        (movePromotes(m0) << 16) +
        (popcount(m1 & kings) << 8) +
        moveCaptureCount(m0)
    } else if (m0 === KILLERS[killerBase] && m1 === KILLERS[killerBase + 1]) {
      score = ORDER_KILLER * 2
    } else if (
      m0 === KILLERS[killerBase + 2] &&
      m1 === KILLERS[killerBase + 3]
    ) {
      score = ORDER_KILLER
    } else {
      score = HISTORY[m0 & 1023]!
    }
    ORDER[orderBase + i] = score
  }
}

/** Swaps the best remaining move into position `i` (selection, lazily). */
function pickMove(
  base: number,
  orderBase: number,
  count: number,
  i: number,
): void {
  let bestJ = i
  let bestScore = ORDER[orderBase + i]!
  for (let j = i + 1; j < count; j++) {
    const s = ORDER[orderBase + j]!
    if (s > bestScore) {
      bestScore = s
      bestJ = j
    }
  }
  if (bestJ === i) return
  ORDER[orderBase + bestJ] = ORDER[orderBase + i]!
  ORDER[orderBase + i] = bestScore
  const a = base + i * MOVE_SLOTS
  const b = base + bestJ * MOVE_SLOTS
  const m0 = STACK[a]!
  const m1 = STACK[a + 1]!
  STACK[a] = STACK[b]!
  STACK[a + 1] = STACK[b + 1]!
  STACK[b] = m0
  STACK[b + 1] = m1
}

/** A quiet move that cut off: killers of this ply and history. */
function rewardQuiet(ply: number, m0: number, m1: number, depth: number): void {
  const killerBase = ply * 4
  if (m0 !== KILLERS[killerBase] || m1 !== KILLERS[killerBase + 1]) {
    KILLERS[killerBase + 2] = KILLERS[killerBase]!
    KILLERS[killerBase + 3] = KILLERS[killerBase + 1]!
    KILLERS[killerBase] = m0
    KILLERS[killerBase + 1] = m1
  }
  const at = m0 & 1023
  const value = HISTORY[at]! + depth * depth
  HISTORY[at] = value
  if (value > HISTORY_LIMIT) {
    for (let i = 0; i < HISTORY.length; i++) HISTORY[i] = HISTORY[i]! >> 1
  }
}
