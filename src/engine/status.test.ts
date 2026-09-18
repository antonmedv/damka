import { describe, expect, it } from 'vitest'
import { initialBitPosition, parsePos } from './position.ts'
import type { BitPosition } from './position.ts'
import { createRng, randomPlacement, randomWalk } from './random.ts'
import { BLACK_WINS, DRAW, ONGOING, WHITE_WINS, status } from './status.ts'
import { CHECKERS, GIVEAWAY } from './variant.ts'
import type { Variant } from './variant.ts'

function statusOf(p: BitPosition, variant: Variant = CHECKERS): number {
  return status(p.white, p.black, p.kings, p.side, p.plies, variant)
}

function giveaway(p: BitPosition): number {
  return statusOf(p, GIVEAWAY)
}

describe('status', () => {
  it('is ongoing at the start', () => {
    expect(statusOf(initialBitPosition())).toBe(ONGOING)
  })

  it('declares the side without pieces the loser', () => {
    expect(statusOf(parsePos('W:W:Bd4'))).toBe(BLACK_WINS)
    expect(statusOf(parsePos('B:Wd4:B'))).toBe(WHITE_WINS)
  })

  it('declares the side without moves the loser', () => {
    expect(statusOf(parsePos('W:Wa1:Bb2,c3'))).toBe(BLACK_WINS)
    expect(statusOf(parsePos('B:Wa1,c1:Bb2'))).toBe(WHITE_WINS)
  })

  it('draws after 30 quiet king plies', () => {
    expect(statusOf(parsePos('W:WKa1:BKh8:29'))).toBe(ONGOING)
    expect(statusOf(parsePos('W:WKa1:BKh8:30'))).toBe(DRAW)
  })

  it('a side without moves loses even on the 30th quiet ply', () => {
    expect(statusOf(parsePos('W:W:BKh8:30'))).toBe(BLACK_WINS)
    expect(statusOf(parsePos('W:WKa1:BKb2,c3:30'))).toBe(BLACK_WINS)
  })
})

describe('status: поддавки', () => {
  it('is ongoing at the start', () => {
    expect(giveaway(initialBitPosition())).toBe(ONGOING)
  })

  it('declares the side without pieces the winner', () => {
    expect(giveaway(parsePos('W:W:Bd4'))).toBe(WHITE_WINS)
    expect(giveaway(parsePos('B:Wd4:B'))).toBe(BLACK_WINS)
  })

  it('declares the side without moves the winner', () => {
    expect(giveaway(parsePos('W:Wa1:Bb2,c3'))).toBe(WHITE_WINS)
    expect(giveaway(parsePos('B:Wa1,c1:Bb2'))).toBe(BLACK_WINS)
  })

  it('draws after 30 quiet king plies, exactly as checkers does', () => {
    expect(giveaway(parsePos('W:WKa1:BKh8:29'))).toBe(ONGOING)
    expect(giveaway(parsePos('W:WKa1:BKh8:30'))).toBe(DRAW)
  })

  it('a side without moves wins even on the 30th quiet ply', () => {
    expect(giveaway(parsePos('W:W:BKh8:30'))).toBe(WHITE_WINS)
    expect(giveaway(parsePos('W:WKa1:BKb2,c3:30'))).toBe(WHITE_WINS)
  })

  /**
   * The whole of the variant, stated as one property: the two games agree
   * everywhere except on who wins when there is nothing to play, and there
   * they are exact opposites. Nothing else about a position may differ.
   */
  it('is the exact inverse of checkers, and only there', () => {
    const rng = createRng(7)
    const positions: BitPosition[] = randomWalk(rng, 120)
    // Placements reach the endings a walk from the start rarely does: a
    // side with nothing left, or with everything blocked.
    for (let i = 0; i < 400; i++) positions.push(randomPlacement(rng))
    let decided = 0
    for (const p of positions) {
      const normal = statusOf(p)
      const other = giveaway(p)
      if (normal === ONGOING || normal === DRAW) {
        expect(other).toBe(normal)
      } else {
        decided++
        expect(other).toBe(normal === WHITE_WINS ? BLACK_WINS : WHITE_WINS)
      }
    }
    // The inverse half of the property is the point; make sure it ran.
    expect(decided).toBeGreaterThan(0)
  })
})
