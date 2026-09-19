/**
 * Transposition table: one `Int32Array`, eight slots per entry, the whole
 * position stored so a hit is verified exactly and a collision can never
 * return a foreign score or move.
 *
 *   slot 0  white
 *   slot 1  black
 *   slot 2  kings
 *   slot 3  meta  = side | plies << 1   (the draw counter is part of the state)
 *   slot 4  score, mate scores relative to the node (see `scoreToTT`)
 *   slot 5  depth | flag << 8 | generation << 10
 *   slot 6  best move m0
 *   slot 7  best move m1                (captured mask: full identity)
 *
 * The search hashes once per node: `ttIndex` gives the entry, `ttMatches`
 * says whether it holds this position, the accessors read it, and
 * `ttStore` writes to the same entry later. Replacement keeps an entry
 * only when it holds another position, comes from the current search
 * (generation) and is deeper; everything else is overwritten.
 */
import { hashPosition } from './hash.ts'
import { MATE_BOUND } from './score.ts'

export const ENTRY_SLOTS = 8
export const EMPTY = 0
export const EXACT = 1
export const LOWER = 2
export const UPPER = 3
/** 2^18 entries of 32 bytes: 8 MB. */
export const DEFAULT_TT_BITS = 18

const GENERATION_MASK = 0x3fffff

/**
 * Allocated by the first search rather than on import: the worker loads
 * both engines, and a session that only ever plays уголки should not
 * carry 8 MB of this game's table.
 */
let TABLE = new Int32Array(0)
let MASK = (1 << DEFAULT_TT_BITS) - 1
let generation = 0

/** Replaces the table with an empty one of `2 ** bits` entries. */
export function ttResize(bits: number): void {
  TABLE = new Int32Array(ENTRY_SLOTS << bits)
  MASK = (1 << bits) - 1
  generation = 0
}

export function ttClear(): void {
  if (TABLE.length === 0) ttResize(DEFAULT_TT_BITS)
  TABLE.fill(0)
  generation = 0
}

/** Marks the start of a new search; older entries then yield to new ones. */
export function ttNewGeneration(): void {
  if (TABLE.length === 0) ttResize(DEFAULT_TT_BITS)
  generation = (generation + 1) & GENERATION_MASK
}

export function ttEntries(): number {
  return MASK + 1
}

/**
 * The fourth position word: side to move, draw counter and variant.
 *
 * The variant belongs here because `ttMatches` verifies a hit against the
 * stored words, so without it a checkers entry and a поддавки entry for
 * the same position would match each other and hand back a score from the
 * wrong game. `plies` never reaches `DRAW_PLIES`, which leaves bit 6 free,
 * so keeping the two games apart costs nothing and needs no one to
 * remember to clear the table.
 */
export function metaOf(side: number, plies: number, variant: number): number {
  return side | (plies << 1) | (variant << 6)
}

/** Base slot of the entry for this position; always valid, hit or not. */
export function ttIndex(
  white: number,
  black: number,
  kings: number,
  meta: number,
): number {
  return (hashPosition(white, black, kings, meta) & MASK) << 3
}

export function ttMatches(
  base: number,
  white: number,
  black: number,
  kings: number,
  meta: number,
): boolean {
  return (
    TABLE[base] === white &&
    TABLE[base + 1] === black &&
    TABLE[base + 2] === kings &&
    TABLE[base + 3] === meta &&
    (TABLE[base + 5]! & 0x300) !== 0
  )
}

export function ttScore(base: number): number {
  return TABLE[base + 4]!
}

export function ttDepth(base: number): number {
  return TABLE[base + 5]! & 0xff
}

export function ttFlag(base: number): number {
  return (TABLE[base + 5]! >>> 8) & 3
}

export function ttMove0(base: number): number {
  return TABLE[base + 6]!
}

export function ttMove1(base: number): number {
  return TABLE[base + 7]!
}

/**
 * Writes the entry at `base` (from `ttIndex` for the same position).
 * `depth` is 0..255 and `flag` is EXACT, LOWER or UPPER; `score` must
 * already be node-relative (`scoreToTT`).
 */
export function ttStore(
  base: number,
  white: number,
  black: number,
  kings: number,
  meta: number,
  depth: number,
  flag: number,
  score: number,
  m0: number,
  m1: number,
): void {
  if (depth > 255) depth = 255
  const info = TABLE[base + 5]!
  if (info !== 0) {
    const same =
      TABLE[base] === white &&
      TABLE[base + 1] === black &&
      TABLE[base + 2] === kings &&
      TABLE[base + 3] === meta
    if (!same && info >>> 10 === generation && (info & 0xff) > depth) return
  }
  TABLE[base] = white
  TABLE[base + 1] = black
  TABLE[base + 2] = kings
  TABLE[base + 3] = meta
  TABLE[base + 4] = score
  TABLE[base + 5] = depth | (flag << 8) | (generation << 10)
  TABLE[base + 6] = m0
  TABLE[base + 7] = m1
}

/**
 * Mate scores are relative to the root (`MATE - ply` of the mate); the
 * table keeps them relative to the node so a transposition reached at
 * another ply reports the right distance.
 */
export function scoreToTT(score: number, ply: number): number {
  if (score >= MATE_BOUND) return score + ply
  if (score <= -MATE_BOUND) return score - ply
  return score
}

export function scoreFromTT(stored: number, ply: number): number {
  if (stored >= MATE_BOUND) return stored - ply
  if (stored <= -MATE_BOUND) return stored + ply
  return stored
}
