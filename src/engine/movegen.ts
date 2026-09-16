/**
 * Legal move generation on 32-square bitboards.
 *
 * Hot path rules: everything is an int32 local or lives in a typed array;
 * no objects, closures or arrays are created. Module-level state is kept
 * in `Int32Array`s (storing a bitboard in a plain `let` could box it).
 */
import {
  RANK_1,
  RANK_8,
  RAY,
  downLeft,
  downRight,
  lsb,
  nearest,
  toSquare64,
  upLeft,
  upRight,
} from './bitboard.ts'
import { packMove } from './move.ts'
import type { DetailedMove } from './move.ts'
import { WHITE } from './position.ts'
import type { BitPosition } from './position.ts'

/**
 * Upper bound on moves in one position; the stack uses it as stride.
 * Quiet moves are bounded by construction: a king reaches at most 13
 * squares (d4 or e5 on an empty board), a man 2, so twelve kings give at
 * most 156. Capture outcomes have no such simple proof; a search over 20k
 * random placements found at most 68 packed moves and 102 capture paths,
 * and `emitCapture` throws rather than spill into the next region.
 */
export const MAX_MOVES = 256
/** Int32 slots per move in the output stack. */
export const MOVE_SLOTS = 2

/* Shared scratch for one `generate` call and its capture search. */
const S = new Int32Array(8)
/** All pieces except the moving piece's origin, fixed for the sequence. */
const OCCUPIED = 0
/** Enemy pieces; capturable = ENEMY & ~captured. */
const ENEMY = 1
const ORIGIN = 2
/** Promotion rank of the side to move. */
const PROMOTION = 3
/** Next free slot in `out`. */
const CURSOR = 4
/** First slot of this call, for dedupe. */
const BASE = 5

/** Capture path by depth, for the detailed emitter. */
const CAPTURED_AT = new Int32Array(32)
const LANDED_AT = new Int32Array(32)

let out: Int32Array = new Int32Array(0)
/** When set, moves are collected as objects (all paths) instead of packed. */
let detailed: DetailedMove[] | null = null

/**
 * Writes every legal move for `side` into `out` starting at slot `base`
 * (two slots per move) and returns the number of moves. Captures are
 * mandatory, so the list is either all captures or all quiet moves:
 * `out[base + 1] !== 0` tells which.
 *
 * Not reentrant: the search state lives in module-level scratch, so never
 * call `generate` or `generateDetailed` from inside another call.
 */
export function generate(
  white: number,
  black: number,
  kings: number,
  side: number,
  target: Int32Array,
  base: number,
): number {
  out = target
  S[CURSOR] = base
  S[BASE] = base
  const own = side === WHITE ? white : black
  const enemy = side === WHITE ? black : white
  const promotion = side === WHITE ? RANK_8 : RANK_1
  const occupied = white | black
  const empty = ~occupied
  const men = own & ~kings
  const ownKings = own & kings
  S[ENEMY] = enemy
  S[PROMOTION] = promotion

  // Men that can capture: walk two steps back from every empty square.
  let candidates =
    (downRight(downRight(empty) & enemy) |
      downLeft(downLeft(empty) & enemy) |
      upRight(upRight(empty) & enemy) |
      upLeft(upLeft(empty) & enemy)) &
    men
  for (; candidates !== 0; candidates &= candidates - 1) {
    const sq = lsb(candidates)
    S[ORIGIN] = sq
    S[OCCUPIED] = occupied & ~(1 << sq)
    manCaptures(sq, 0, 0)
  }
  for (let rest = ownKings; rest !== 0; rest &= rest - 1) {
    const sq = lsb(rest)
    S[ORIGIN] = sq
    S[OCCUPIED] = occupied & ~(1 << sq)
    kingCaptures(sq, 0, 0, 0)
  }
  if (S[CURSOR] !== base) return (S[CURSOR] - base) >> 1

  // Quiet men moves, one direction at a time; the origin is one step back.
  if (side === WHITE) {
    for (let t = upLeft(men) & empty; t !== 0; t &= t - 1) {
      const b = t & -t
      emitQuiet(lsb(downRight(b)), lsb(b), (b & RANK_8) !== 0 ? 1 : 0)
    }
    for (let t = upRight(men) & empty; t !== 0; t &= t - 1) {
      const b = t & -t
      emitQuiet(lsb(downLeft(b)), lsb(b), (b & RANK_8) !== 0 ? 1 : 0)
    }
  } else {
    for (let t = downLeft(men) & empty; t !== 0; t &= t - 1) {
      const b = t & -t
      emitQuiet(lsb(upRight(b)), lsb(b), (b & RANK_1) !== 0 ? 1 : 0)
    }
    for (let t = downRight(men) & empty; t !== 0; t &= t - 1) {
      const b = t & -t
      emitQuiet(lsb(upLeft(b)), lsb(b), (b & RANK_1) !== 0 ? 1 : 0)
    }
  }

  // Quiet king moves: the ray up to (excluding) the first blocker.
  for (let rest = ownKings; rest !== 0; rest &= rest - 1) {
    const sq = lsb(rest)
    for (let dir = 0; dir < 4; dir++) {
      const ray = RAY[(dir << 5) | sq]!
      const blockers = ray & occupied
      let targets = ray
      if (blockers !== 0) {
        const first = nearest(blockers, dir)
        targets = ray & ~first & ~RAY[(dir << 5) | lsb(first)]!
      }
      for (; targets !== 0; targets &= targets - 1) {
        emitQuiet(sq, lsb(targets), 0)
      }
    }
  }
  return (S[CURSOR] - base) >> 1
}

/**
 * Man capture search from `sq` with `captured` pieces already taken and
 * `depth` captures made. A man that lands on the back rank continues as a
 * king at once.
 */
function manCaptures(sq: number, captured: number, depth: number): void {
  const capturable = S[ENEMY]! & ~captured
  const empty = ~S[OCCUPIED]!
  const b = 1 << sq
  let continued = 0

  let mid = upLeft(b) & capturable
  if (mid !== 0) {
    const land = upLeft(mid) & empty
    if (land !== 0) {
      continued = 1
      landAfterMan(mid, land, captured, depth)
    }
  }
  mid = upRight(b) & capturable
  if (mid !== 0) {
    const land = upRight(mid) & empty
    if (land !== 0) {
      continued = 1
      landAfterMan(mid, land, captured, depth)
    }
  }
  mid = downLeft(b) & capturable
  if (mid !== 0) {
    const land = downLeft(mid) & empty
    if (land !== 0) {
      continued = 1
      landAfterMan(mid, land, captured, depth)
    }
  }
  mid = downRight(b) & capturable
  if (mid !== 0) {
    const land = downRight(mid) & empty
    if (land !== 0) {
      continued = 1
      landAfterMan(mid, land, captured, depth)
    }
  }

  if (continued === 0 && depth > 0) emitCapture(sq, 0, captured, depth)
}

function landAfterMan(
  mid: number,
  land: number,
  captured: number,
  depth: number,
): void {
  const landSq = lsb(land)
  CAPTURED_AT[depth] = lsb(mid)
  LANDED_AT[depth] = landSq
  if ((land & S[PROMOTION]!) !== 0) {
    kingCaptures(landSq, captured | mid, depth + 1, 1)
  } else {
    manCaptures(landSq, captured | mid, depth + 1)
  }
}

/**
 * King capture search. Per direction: the first piece on the ray must be
 * capturable and have empty squares behind it. If the king can keep
 * capturing from some of those squares it must land on one of them;
 * otherwise each of them ends the move.
 */
function kingCaptures(
  sq: number,
  captured: number,
  depth: number,
  promotes: number,
): void {
  const occupied = S[OCCUPIED]!
  const capturable = S[ENEMY]! & ~captured
  let continued = 0

  for (let dir = 0; dir < 4; dir++) {
    const blockers = RAY[(dir << 5) | sq]! & occupied
    if (blockers === 0) continue
    const first = nearest(blockers, dir)
    if ((first & capturable) === 0) continue
    const firstSq = lsb(first)
    const beyond = RAY[(dir << 5) | firstSq]!
    const blockers2 = beyond & occupied
    let landings = beyond
    if (blockers2 !== 0) {
      const second = nearest(blockers2, dir)
      landings = beyond & ~second & ~RAY[(dir << 5) | lsb(second)]!
    }
    if (landings === 0) continue

    continued = 1
    const nowCaptured = captured | first
    CAPTURED_AT[depth] = firstSq
    let continuing = 0
    for (let rest = landings; rest !== 0; rest &= rest - 1) {
      if (kingCanCapture(lsb(rest), nowCaptured)) continuing |= rest & -rest
    }
    if (continuing !== 0) {
      for (let rest = continuing; rest !== 0; rest &= rest - 1) {
        const landSq = lsb(rest)
        LANDED_AT[depth] = landSq
        kingCaptures(landSq, nowCaptured, depth + 1, promotes)
      }
    } else {
      for (let rest = landings; rest !== 0; rest &= rest - 1) {
        const landSq = lsb(rest)
        LANDED_AT[depth] = landSq
        emitCapture(landSq, promotes, nowCaptured, depth + 1)
      }
    }
  }

  if (continued === 0 && depth > 0) emitCapture(sq, promotes, captured, depth)
}

/** Whether a king on `sq` has any capture left. */
function kingCanCapture(sq: number, captured: number): boolean {
  const occupied = S[OCCUPIED]!
  const capturable = S[ENEMY]! & ~captured
  for (let dir = 0; dir < 4; dir++) {
    const blockers = RAY[(dir << 5) | sq]! & occupied
    if (blockers === 0) continue
    const first = nearest(blockers, dir)
    if ((first & capturable) === 0) continue
    // The square right behind the piece is the nearest one on its ray.
    const beyond = RAY[(dir << 5) | lsb(first)]!
    if (beyond !== 0 && (nearest(beyond, dir) & occupied) === 0) return true
  }
  return false
}

/**
 * Records a complete capture sequence ending on `to` after `count`
 * captures. Packed output keeps one move per outcome; the detailed output
 * keeps every path (and the packed slots are then only a counter).
 */
function emitCapture(
  to: number,
  promotes: number,
  captured: number,
  count: number,
): void {
  const from = S[ORIGIN]!
  const m0 = packMove(from, to, promotes, count)
  const end = S[CURSOR]!
  if (detailed !== null) {
    detailed.push(detailedMove(from, to, promotes, captured, count))
  } else {
    for (let i = S[BASE]!; i < end; i += 2) {
      if (out[i] === m0 && out[i + 1] === captured) return
    }
  }
  if (end >= S[BASE]! + MAX_MOVES * MOVE_SLOTS) {
    throw new Error(`more than ${MAX_MOVES} capture moves in one position`)
  }
  out[end] = m0
  out[end + 1] = captured
  S[CURSOR] = end + 2
}

function emitQuiet(from: number, to: number, promotes: number): void {
  if (detailed !== null) detailed.push(detailedMove(from, to, promotes, 0, 0))
  const end = S[CURSOR]!
  out[end] = packMove(from, to, promotes, 0)
  out[end + 1] = 0
  S[CURSOR] = end + 2
}

function detailedMove(
  from: number,
  to: number,
  promotes: number,
  captured: number,
  count: number,
): DetailedMove {
  const captures: number[] = []
  const path: number[] = []
  for (let i = 0; i < count; i++) {
    captures.push(toSquare64(CAPTURED_AT[i]!))
    path.push(toSquare64(LANDED_AT[i]!))
  }
  if (captured === 0) path.push(toSquare64(to))
  return {
    from: toSquare64(from),
    to: toSquare64(to),
    captures,
    promotes: promotes !== 0,
    path,
  }
}

const DETAILED_SCRATCH = new Int32Array(MAX_MOVES * MOVE_SLOTS)

/**
 * Every legal move as objects in UI coordinates, one per capture path.
 * For the UI and tests; allocates, never used inside the search.
 */
export function generateDetailed(p: BitPosition): DetailedMove[] {
  const moves: DetailedMove[] = []
  detailed = moves
  try {
    generate(p.white, p.black, p.kings, p.side, DETAILED_SCRATCH, 0)
  } finally {
    detailed = null
  }
  return moves
}
