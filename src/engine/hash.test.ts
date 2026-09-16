import { describe, expect, it } from 'vitest'
import { hashPosition } from './hash.ts'
import { initialBitPosition } from './position.ts'
import type { BitPosition } from './position.ts'
import { createRng, randomPlacement, randomWalk } from './random.ts'
import { metaOf } from './tt.ts'

function hash(p: BitPosition): number {
  return hashPosition(p.white, p.black, p.kings, metaOf(p.side, p.plies))
}

describe('hashPosition', () => {
  it('is a pure function of the four words', () => {
    const p = initialBitPosition()
    expect(hash(p)).toBe(hash({ ...p }))
    expect(hash(p)).toBe(hash(initialBitPosition()))
  })

  it('changes with the side to move and the draw counter', () => {
    const p = initialBitPosition()
    expect(hash({ ...p, side: 1 })).not.toBe(hash(p))
    expect(hash({ ...p, plies: 1 })).not.toBe(hash(p))
    expect(hash({ ...p, kings: 1 })).not.toBe(hash(p))
  })

  it('spreads positions over 2^18 entries about as well as chance', () => {
    const rng = createRng(19)
    const positions = randomWalk(rng, 400)
    while (positions.length < 20000) positions.push(randomPlacement(rng))
    const entries = 1 << 18
    const seen = new Set<number>()
    for (const p of positions) seen.add(hash(p) & (entries - 1))
    // Expected pairwise collisions n^2 / 2m ≈ 763 for these sizes.
    const collisions = positions.length - seen.size
    expect(collisions).toBeLessThan(1200)
  })

  it('also spreads over the low bits alone', () => {
    const rng = createRng(23)
    const buckets = new Int32Array(1 << 10)
    for (let i = 0; i < 1 << 14; i++) {
      const p = randomPlacement(rng)
      buckets[hash(p) & 0x3ff]!++
    }
    // 16 per bucket on average; a fair hash stays well under three times that.
    expect(Math.max(...buckets)).toBeLessThan(48)
    expect(Math.min(...buckets)).toBeGreaterThan(0)
  })
})
