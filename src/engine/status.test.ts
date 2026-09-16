import { describe, expect, it } from 'vitest'
import { initialBitPosition, parsePos } from './position.ts'
import type { BitPosition } from './position.ts'
import { BLACK_WINS, DRAW, ONGOING, WHITE_WINS, status } from './status.ts'

function statusOf(p: BitPosition): number {
  return status(p.white, p.black, p.kings, p.side, p.plies)
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
