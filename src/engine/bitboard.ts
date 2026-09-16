/**
 * 32-square bitboards for Russian checkers.
 *
 * Only the 32 dark squares are playable, so one side fits in a single int32.
 * Square index `sq32 = rank * 4 + (file >> 1)`; white sits at the bottom:
 *
 *   rank 8:    28  29  30  31        b8 d8 f8 h8
 *   rank 7:  24  25  26  27          a7 c7 e7 g7
 *   rank 6:    20  21  22  23        b6 d6 f6 h6
 *   rank 5:  16  17  18  19          a5 c5 e5 g5
 *   rank 4:    12  13  14  15        b4 d4 f4 h4
 *   rank 3:   8   9  10  11          a3 c3 e3 g3
 *   rank 2:     4   5   6   7        b2 d2 f2 h2
 *   rank 1:   0   1   2   3          a1 c1 e1 g1
 *
 * Every bitboard is a signed int32. Compare with `!== 0`, never `<`/`>`:
 * bit 31 (h8) makes the number negative. All shifts drop bits that leave
 * the board, which is exactly the edge.
 */

/** Ranks 1, 3, 5, 7 — files a c e g. */
export const EVEN_RANKS = 0x0f0f0f0f | 0
/** Ranks 2, 4, 6, 8 — files b d f h. */
export const ODD_RANKS = 0xf0f0f0f0 | 0
const EVEN_NOT_A = 0x0e0e0e0e | 0
const ODD_NOT_H = 0x70707070 | 0

export const RANK_1 = 0x0000000f | 0
export const RANK_8 = 0xf0000000 | 0
export const ALL_SQUARES = -1

/** Directions from white's point of view; up = towards rank 8. */
export const UP_LEFT = 0
export const UP_RIGHT = 1
export const DOWN_LEFT = 2
export const DOWN_RIGHT = 3

/**
 * One diagonal step for every bit at once. From an even rank the step is
 * +3 / +4 / −5 / −4, from an odd rank +4 / +5 / −4 / −3; the masks also
 * drop the a-file (no left step) and the h-file (no right step).
 */
export function upLeft(b: number): number {
  return ((b & EVEN_NOT_A) << 3) | ((b & ODD_RANKS) << 4)
}

export function upRight(b: number): number {
  return ((b & EVEN_RANKS) << 4) | ((b & ODD_NOT_H) << 5)
}

export function downLeft(b: number): number {
  return ((b & EVEN_NOT_A) >>> 5) | ((b & ODD_RANKS) >>> 4)
}

export function downRight(b: number): number {
  return ((b & EVEN_RANKS) >>> 4) | ((b & ODD_NOT_H) >>> 3)
}

/** Generic step; for table building and tests, not for the hot path. */
export function step(b: number, dir: number): number {
  switch (dir) {
    case UP_LEFT:
      return upLeft(b)
    case UP_RIGHT:
      return upRight(b)
    case DOWN_LEFT:
      return downLeft(b)
    default:
      return downRight(b)
  }
}

/** The step that undoes `dir`. */
export function oppositeDirection(dir: number): number {
  return 3 - dir
}

export function bit(sq: number): number {
  return 1 << sq
}

/** Index of the lowest set bit; `b` must be non-zero. */
export function lsb(b: number): number {
  return 31 - Math.clz32(b & -b)
}

/** Index of the highest set bit; `b` must be non-zero. */
export function msb(b: number): number {
  return 31 - Math.clz32(b)
}

/** Isolates the lowest set bit. */
export function lowest(b: number): number {
  return b & -b
}

/** Isolates the highest set bit; `b` must be non-zero. */
export function highest(b: number): number {
  return 1 << (31 - Math.clz32(b))
}

/**
 * The blocker nearest to a square along `dir`: walking up the board means
 * increasing indices, so the nearest is the lowest bit; walking down it is
 * the highest. `blockers` must be non-zero.
 */
export function nearest(blockers: number, dir: number): number {
  return dir < 2 ? blockers & -blockers : 1 << (31 - Math.clz32(blockers))
}

/** Number of set bits (SWAR). `Math.imul` keeps the last step in int32. */
export function popcount(b: number): number {
  b = (b - ((b >>> 1) & 0x55555555)) | 0
  b = (b & 0x33333333) + ((b >>> 2) & 0x33333333)
  b = (b + (b >>> 4)) & 0x0f0f0f0f
  return Math.imul(b, 0x01010101) >>> 24
}

/** Reverses bit order; a 180° turn of the board, `sq` → `31 - sq`. */
export function reverse32(b: number): number {
  b = ((b >>> 1) & 0x55555555) | ((b & 0x55555555) << 1)
  b = ((b >>> 2) & 0x33333333) | ((b & 0x33333333) << 2)
  b = ((b >>> 4) & 0x0f0f0f0f) | ((b & 0x0f0f0f0f) << 4)
  b = ((b >>> 8) & 0x00ff00ff) | ((b & 0x00ff00ff) << 8)
  return (b >>> 16) | (b << 16)
}

/**
 * All squares strictly beyond `sq` in direction `dir`, to the edge.
 * Index `(dir << 5) | sq`.
 */
export const RAY: Int32Array = buildRays()

export function ray(sq: number, dir: number): number {
  return RAY[(dir << 5) | sq]!
}

function buildRays(): Int32Array {
  const rays = new Int32Array(128)
  for (let dir = 0; dir < 4; dir++) {
    for (let sq = 0; sq < 32; sq++) {
      let mask = 0
      for (let b = step(bit(sq), dir); b !== 0; b = step(b, dir)) {
        mask |= b
      }
      rays[(dir << 5) | sq] = mask
    }
  }
  return rays
}

const FILES = 'abcdefgh'

export function rankOf32(sq: number): number {
  return sq >> 2
}

export function fileOf32(sq: number): number {
  return ((sq & 3) << 1) | ((sq >> 2) & 1)
}

/** 64-square index (a1 = 0, h8 = 63) used by the UI. */
export function toSquare64(sq: number): number {
  return (sq >> 2) * 8 + fileOf32(sq)
}

/** Inverse of `toSquare64`; throws for a light square. */
export function fromSquare64(sq64: number): number {
  const file = sq64 & 7
  const rank = sq64 >> 3
  if (((file + rank) & 1) !== 0 || sq64 < 0 || sq64 > 63) {
    throw new Error(`not a dark square: ${sq64}`)
  }
  return rank * 4 + (file >> 1)
}

export function squareName32(sq: number): string {
  return `${FILES[fileOf32(sq)]}${rankOf32(sq) + 1}`
}

export function squareFromName32(name: string): number {
  const file = FILES.indexOf(name.charAt(0))
  const rank = Number(name.charAt(1)) - 1
  if (name.length !== 2 || file < 0 || !(rank >= 0 && rank <= 7)) {
    throw new Error(`invalid square name: ${name}`)
  }
  return fromSquare64(rank * 8 + file)
}

/** Square names of every set bit, lowest index first. */
export function squareNames32(b: number): string[] {
  const names: string[] = []
  for (let rest = b; rest !== 0; rest &= rest - 1) {
    names.push(squareName32(lsb(rest)))
  }
  return names
}
