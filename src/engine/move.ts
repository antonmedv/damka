import type { Move } from '../game/types.ts'

/**
 * A legal move with its full path, in UI (64-square) coordinates: the UI's
 * own `Move`. Two moves with the same `moveKey` reach the same position by
 * different paths; the UI keeps both, the search keeps one.
 */
export type DetailedMove = Move

/** Identity of a move by outcome: equal keys mean equal resulting positions. */
export function moveKey(move: Move): string {
  const captures = [...move.captures].sort((a, b) => a - b)
  const king = move.promotes ? 'K' : ''
  return `${move.from}>${move.to}${king}:${captures.join(',')}`
}

/*
 * Packed move: two int32 slots in the move stack.
 *   slot 0: from | to << 5 | promotes << 10 | captureCount << 11
 *   slot 1: bitboard of captured pieces (0 for a quiet move)
 * Squares are engine (32-square) indices.
 */

export function packMove(
  from: number,
  to: number,
  promotes: number,
  captureCount: number,
): number {
  return from | (to << 5) | (promotes << 10) | (captureCount << 11)
}

export function moveFrom(m0: number): number {
  return m0 & 31
}

export function moveTo(m0: number): number {
  return (m0 >>> 5) & 31
}

export function movePromotes(m0: number): number {
  return (m0 >>> 10) & 1
}

export function moveCaptureCount(m0: number): number {
  return m0 >>> 11
}
