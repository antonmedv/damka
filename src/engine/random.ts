/**
 * Deterministic random positions for differential tests and benchmarks.
 */
import { APPLIED, makeMove } from './apply.ts'
import { RANK_1, RANK_8, bit, popcount } from './bitboard.ts'
import { MAX_MOVES, MOVE_SLOTS, generate } from './movegen.ts'
import { BLACK, WHITE, initialBitPosition } from './position.ts'
import type { BitPosition } from './position.ts'

/** mulberry32: small, seedable, good enough for fixtures. */
export function createRng(seed: number): () => number {
  let state = seed | 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SCRATCH = new Int32Array(MAX_MOVES * MOVE_SLOTS)

/**
 * Positions along one game of uniformly random legal moves from the
 * start, up to `maxPlies` or the end of the game. The first entry is the
 * initial position.
 */
export function randomWalk(rng: () => number, maxPlies: number): BitPosition[] {
  const walk: BitPosition[] = [initialBitPosition()]
  let p = walk[0]!
  for (let ply = 0; ply < maxPlies; ply++) {
    const count = generate(p.white, p.black, p.kings, p.side, SCRATCH, 0)
    if (count === 0) break
    const i = Math.floor(rng() * count) * MOVE_SLOTS
    makeMove(
      p.white,
      p.black,
      p.kings,
      p.side,
      p.plies,
      SCRATCH[i]!,
      SCRATCH[i + 1]!,
    )
    p = {
      white: APPLIED[0]!,
      black: APPLIED[1]!,
      kings: APPLIED[2]!,
      side: p.side === WHITE ? BLACK : WHITE,
      plies: APPLIED[3]!,
    }
    walk.push(p)
  }
  return walk
}

/**
 * A random placement: 2–23 pieces on distinct squares, at most 12 per side
 * (a side may be empty), some of them kings, men never on their own
 * promotion rank. Not necessarily reachable in a game, which is fine for
 * comparing two generators.
 */
export function randomPlacement(rng: () => number): BitPosition {
  const total = 2 + Math.floor(rng() * 22)
  let white = 0
  let black = 0
  let kings = 0
  let placed = 0
  while (placed < total) {
    const sq = Math.floor(rng() * 32)
    const b = bit(sq)
    if (((white | black) & b) !== 0) continue
    const toWhite =
      popcount(white) < 12 && (popcount(black) >= 12 || rng() < 0.5)
    const king = rng() < 0.2
    if (toWhite) {
      if (!king && (b & RANK_8) !== 0) continue
      white |= b
    } else {
      if (!king && (b & RANK_1) !== 0) continue
      black |= b
    }
    if (king) kings |= b
    placed++
  }
  return { white, black, kings, side: rng() < 0.5 ? WHITE : BLACK, plies: 0 }
}
