/**
 * Position hash for the transposition table.
 *
 * The position already sits in four int32 words (`white`, `black`, `kings`
 * and `meta = side | plies << 1`), so there is no incremental Zobrist key:
 * the words go through the murmur3 body and finaliser with `Math.imul`.
 * The table verifies a hit against the stored words, so the hash only has
 * to spread positions over the entries, never to identify them.
 */
const C1 = 0xcc9e2d51 | 0
const C2 = 0x1b873593 | 0
const C3 = 0xe6546b64 | 0
const SEED = 0x9747b28c | 0

function mixWord(h: number, k: number): number {
  k = Math.imul(k, C1)
  k = (k << 15) | (k >>> 17)
  k = Math.imul(k, C2)
  h ^= k
  h = (h << 13) | (h >>> 19)
  return (Math.imul(h, 5) + C3) | 0
}

export function hashPosition(
  white: number,
  black: number,
  kings: number,
  meta: number,
): number {
  let h = mixWord(SEED, white)
  h = mixWord(h, black)
  h = mixWord(h, kings)
  h = mixWord(h, meta)
  h ^= 16
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  return h ^ (h >>> 16)
}
