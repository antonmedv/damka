import { describe, expect, it } from 'vitest'
import { fromBitPosition } from './adapter.ts'
import { perft } from './perft.ts'
import { initialBitPosition, parsePos } from './position.ts'
import type { BitPosition } from './position.ts'
import { mailboxPerft } from './reference/mailbox.ts'

function perftOf(p: BitPosition, depth: number): number {
  return perft(p.white, p.black, p.kings, p.side, depth)
}

const FIXTURES = {
  midgame:
    'W:Wa1,c1,e1,b2,f2,a3,c3,e3,g3,d4,h4:Bb6,d6,f6,h6,a7,c7,e7,b8,f8,h8,e5',
  kings: 'W:WKd4,Kg1,a3:BKh8,b6,c7',
  tactics: 'B:Wc3,e3,g3,d4,f4,b2,Kh2:Bd6,f6,c5,e5,g5,b6,Kb8',
}

describe('perft', () => {
  it('agrees with the reference from the initial position', () => {
    const p = initialBitPosition()
    const reference = fromBitPosition(p)
    for (let depth = 0; depth <= 5; depth++) {
      expect(perftOf(p, depth), `depth ${depth}`).toBe(
        mailboxPerft(reference, depth),
      )
    }
  })

  it('agrees with the reference on fixtures', () => {
    for (const [name, literal] of Object.entries(FIXTURES)) {
      const p = parsePos(literal)
      expect(perftOf(p, 4), name).toBe(mailboxPerft(fromBitPosition(p), 4))
    }
  })

  it('matches the frozen counts', () => {
    const p = initialBitPosition()
    // Computed here and confirmed by the reference generator up to depth 6.
    // English checkers shares 1–1469; Russian men capture backward from ply 5.
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map((d) => perftOf(p, d))).toEqual([
      1, 7, 49, 302, 1469, 7482, 37986, 190146, 929899,
    ])
  })
})
