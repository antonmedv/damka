import { describe, expect, it } from 'vitest'
import { RANK_1, RANK_8, popcount } from './bitboard.ts'
import {
  BLACK,
  WHITE,
  formatPos,
  initialBitPosition,
  mirror,
  parsePos,
} from './position.ts'

const INITIAL =
  'W:Wa1,c1,e1,g1,b2,d2,f2,h2,a3,c3,e3,g3:Bb6,d6,f6,h6,a7,c7,e7,g7,b8,d8,f8,h8'

describe('initial position', () => {
  it('has 12 men per side on the first and last three ranks', () => {
    const p = initialBitPosition()
    expect(popcount(p.white)).toBe(12)
    expect(popcount(p.black)).toBe(12)
    expect(p.kings).toBe(0)
    expect(p.side).toBe(WHITE)
    expect(p.white & RANK_1).toBe(RANK_1)
    expect(p.black & RANK_8).toBe(RANK_8)
    expect(p.white & p.black).toBe(0)
    expect(formatPos(p)).toBe(INITIAL)
  })
})

describe('position literal', () => {
  it('round-trips through parse and format', () => {
    for (const text of [
      INITIAL,
      'B:Wa1,Kc3:Bf6,Kh8',
      'W:W:B',
      'W:WKh8:B',
      'B:Wa1:Bh8:17',
    ]) {
      expect(formatPos(parsePos(text))).toBe(text)
    }
  })

  it('places kings in both colour boards and the kings board', () => {
    const p = parsePos('W:Wa1,Kc3:Bf6,Kh8')
    expect(formatPos({ ...p, kings: 0 })).toBe('W:Wa1,c3:Bf6,h8')
    expect(popcount(p.kings)).toBe(2)
    expect(p.kings & p.white).not.toBe(0)
    expect(p.kings & p.black).not.toBe(0)
  })

  it('parses the draw counter', () => {
    expect(parsePos('W:Wa1:Bh8').plies).toBe(0)
    expect(parsePos('W:Wa1:Bh8:29').plies).toBe(29)
  })

  it('rejects malformed literals', () => {
    expect(() => parsePos('X:Wa1:Bh8')).toThrow('invalid side')
    expect(() => parsePos('W:a1:Bh8')).toThrow('invalid position literal')
    expect(() => parsePos('W:Wa1')).toThrow('invalid position literal')
    expect(() => parsePos('W:Wa1:Ba1')).toThrow('square used twice')
    expect(() => parsePos('W:Wa1,Ka1:B')).toThrow('square used twice')
    expect(() => parsePos('W:Wb1:B')).toThrow('not a dark square')
    expect(() => parsePos('W:Wa1:Bh8:-1')).toThrow('invalid draw counter')
    expect(() => parsePos('W:Wa1:Bh8:x')).toThrow('invalid draw counter')
  })
})

describe('mirror', () => {
  it('turns the board and swaps colours and side', () => {
    const p = parsePos('W:Wa1,Kb2:Be5:3')
    const m = mirror(p)
    expect(formatPos(m)).toBe('B:Wd4:BKg7,h8:3')
    expect(m.side).toBe(BLACK)
  })

  it('is its own inverse', () => {
    const p = parsePos('B:Wa1,Kc3,e5:Bf6,Kh8,b6:7')
    expect(mirror(mirror(p))).toEqual(p)
  })

  it('maps the initial position onto itself with colours swapped', () => {
    const p = initialBitPosition()
    const m = mirror(p)
    expect(m.white).toBe(p.white)
    expect(m.black).toBe(p.black)
    expect(m.side).toBe(BLACK)
  })
})
