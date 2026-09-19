/**
 * Transposition table of the уголки search: one `Int32Array`, eight slots
 * per entry, the whole position stored so a hit is verified exactly and a
 * collision can never return a foreign score or move.
 *
 *   slot 0–3  the four position words (`WORDS` in `board.ts`)
 *   slot 4    meta = side | ply << 1   (the ply count is part of the state:
 *             the blocking rules read it)
 *   slot 5    score, mate scores relative to the node (`scoreToTT`)
 *   slot 6    depth | flag << 8 | generation << 10
 *   slot 7    best move
 *
 * Same protocol as the checkers table: `ttIndex` finds the entry,
 * `ttMatches` says whether it holds this position, `ttStore` writes it.
 * Replacement keeps an entry only when it holds another position, comes
 * from the current search and is deeper.
 */
import { HASH_SEED, finishHash, mixWord } from '../engine/hash.ts'
import { MATE_BOUND } from '../engine/score.ts'
import { EXACT, LOWER, UPPER } from '../engine/tt.ts'
import { WORDS } from './board.ts'

export { EXACT, LOWER, UPPER }

export const ENTRY_SLOTS = 8
/** 2^18 entries of 32 bytes: 8 MB. */
export const DEFAULT_TT_BITS = 18

const GENERATION_MASK = 0x3fffff

/**
 * Allocated by the first search rather than on import: the worker loads
 * both engines, and a session that only ever plays checkers should not
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

export function metaOf(side: number, ply: number): number {
  return side | (ply << 1)
}

/** Base slot of the entry for the loaded position; always valid, hit or not. */
export function ttIndex(meta: number): number {
  let h = mixWord(HASH_SEED, WORDS[0]!)
  h = mixWord(h, WORDS[1]!)
  h = mixWord(h, WORDS[2]!)
  h = mixWord(h, WORDS[3]!)
  h = mixWord(h, meta)
  return (finishHash(h, 5) & MASK) << 3
}

export function ttMatches(base: number, meta: number): boolean {
  return (
    TABLE[base] === WORDS[0] &&
    TABLE[base + 1] === WORDS[1] &&
    TABLE[base + 2] === WORDS[2] &&
    TABLE[base + 3] === WORDS[3] &&
    TABLE[base + 4] === meta &&
    (TABLE[base + 6]! & 0x300) !== 0
  )
}

export function ttScore(base: number): number {
  return TABLE[base + 5]!
}

export function ttDepth(base: number): number {
  return TABLE[base + 6]! & 0xff
}

export function ttFlag(base: number): number {
  return (TABLE[base + 6]! >>> 8) & 3
}

export function ttMove(base: number): number {
  return TABLE[base + 7]!
}

/**
 * Writes the loaded position's entry at `base` (from `ttIndex` for the
 * same position and meta). `depth` is 0..255, `flag` EXACT, LOWER or
 * UPPER, `score` node-relative (`scoreToTT`).
 */
export function ttStore(
  base: number,
  meta: number,
  depth: number,
  flag: number,
  score: number,
  move: number,
): void {
  if (depth > 255) depth = 255
  const info = TABLE[base + 6]!
  if (info !== 0) {
    const same =
      TABLE[base] === WORDS[0] &&
      TABLE[base + 1] === WORDS[1] &&
      TABLE[base + 2] === WORDS[2] &&
      TABLE[base + 3] === WORDS[3] &&
      TABLE[base + 4] === meta
    if (!same && info >>> 10 === generation && (info & 0xff) > depth) return
  }
  TABLE[base] = WORDS[0]!
  TABLE[base + 1] = WORDS[1]!
  TABLE[base + 2] = WORDS[2]!
  TABLE[base + 3] = WORDS[3]!
  TABLE[base + 4] = meta
  TABLE[base + 5] = score
  TABLE[base + 6] = depth | (flag << 8) | (generation << 10)
  TABLE[base + 7] = move
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
