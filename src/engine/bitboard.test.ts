import { describe, expect, it } from 'vitest'
import {
  ALL_SQUARES,
  DOWN_LEFT,
  DOWN_RIGHT,
  EVEN_RANKS,
  ODD_RANKS,
  RANK_1,
  RANK_8,
  UP_LEFT,
  UP_RIGHT,
  bit,
  downLeft,
  downRight,
  fileOf32,
  fromSquare64,
  highest,
  lowest,
  lsb,
  msb,
  nearest,
  oppositeDirection,
  popcount,
  rankOf32,
  ray,
  reverse32,
  squareFromName32,
  squareName32,
  squareNames32,
  step,
  toSquare64,
  upLeft,
  upRight,
} from './bitboard.ts'

/** Bit of the dark square at (file, rank), or 0 when off the board. */
function geometric(file: number, rank: number): number {
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return 0
  return bit(rank * 4 + (file >> 1))
}

const DIRECTIONS = [
  { dir: UP_LEFT, df: -1, dr: 1, fn: upLeft },
  { dir: UP_RIGHT, df: 1, dr: 1, fn: upRight },
  { dir: DOWN_LEFT, df: -1, dr: -1, fn: downLeft },
  { dir: DOWN_RIGHT, df: 1, dr: -1, fn: downRight },
]

describe('square layout', () => {
  it('numbers a1 = 0, g1 = 3, b2 = 4, b8 = 28, h8 = 31', () => {
    expect(squareName32(0)).toBe('a1')
    expect(squareName32(3)).toBe('g1')
    expect(squareName32(4)).toBe('b2')
    expect(squareName32(28)).toBe('b8')
    expect(squareName32(31)).toBe('h8')
  })

  it('round-trips every square through 64-square index and name', () => {
    const seen = new Set<number>()
    for (let sq = 0; sq < 32; sq++) {
      const sq64 = toSquare64(sq)
      expect(((sq64 & 7) + (sq64 >> 3)) & 1).toBe(0)
      expect(fromSquare64(sq64)).toBe(sq)
      expect(squareFromName32(squareName32(sq))).toBe(sq)
      expect(fileOf32(sq)).toBe(sq64 & 7)
      expect(rankOf32(sq)).toBe(sq64 >> 3)
      seen.add(sq64)
    }
    expect(seen.size).toBe(32)
  })

  it('rejects light squares and bad names', () => {
    expect(() => fromSquare64(1)).toThrow('not a dark square')
    expect(() => squareFromName32('b1')).toThrow('not a dark square')
    expect(() => squareFromName32('i1')).toThrow('invalid square name')
    expect(() => squareFromName32('a9')).toThrow('invalid square name')
    expect(() => squareFromName32('a10')).toThrow('invalid square name')
  })

  it('rank masks cover the board without overlap', () => {
    expect(EVEN_RANKS | ODD_RANKS).toBe(ALL_SQUARES)
    expect(EVEN_RANKS & ODD_RANKS).toBe(0)
    expect(squareNames32(RANK_1)).toEqual(['a1', 'c1', 'e1', 'g1'])
    expect(squareNames32(RANK_8)).toEqual(['b8', 'd8', 'f8', 'h8'])
  })
})

describe('steps', () => {
  it('match file/rank arithmetic for every square and direction', () => {
    for (let sq = 0; sq < 32; sq++) {
      const file = fileOf32(sq)
      const rank = rankOf32(sq)
      for (const { dir, df, dr, fn } of DIRECTIONS) {
        const expected = geometric(file + df, rank + dr)
        expect(fn(bit(sq))).toBe(expected)
        expect(step(bit(sq), dir)).toBe(expected)
      }
    }
  })

  it('move whole bitboards at once', () => {
    const men = bit(squareFromName32('c3')) | bit(squareFromName32('h2'))
    expect(squareNames32(upLeft(men))).toEqual(['g3', 'b4'])
    expect(squareNames32(upRight(men))).toEqual(['d4'])
  })

  it('oppositeDirection undoes a direction', () => {
    for (const { dir } of DIRECTIONS) {
      const sq = bit(squareFromName32('d4'))
      expect(step(step(sq, dir), oppositeDirection(dir))).toBe(sq)
    }
  })
})

describe('bit utilities', () => {
  it('scans lowest and highest bits including bit 31', () => {
    expect(lsb(1)).toBe(0)
    expect(lsb(RANK_8)).toBe(28)
    expect(msb(RANK_8)).toBe(31)
    expect(msb(1)).toBe(0)
    expect(lowest(0b1100)).toBe(0b100)
    expect(highest(0b1100)).toBe(0b1000)
    expect(highest(RANK_8)).toBe(bit(31))
  })

  it('finds the nearest blocker by direction', () => {
    const blockers = bit(5) | bit(20)
    expect(nearest(blockers, UP_LEFT)).toBe(bit(5))
    expect(nearest(blockers, UP_RIGHT)).toBe(bit(5))
    expect(nearest(blockers, DOWN_LEFT)).toBe(bit(20))
    expect(nearest(blockers, DOWN_RIGHT)).toBe(bit(20))
  })

  it('counts bits', () => {
    expect(popcount(0)).toBe(0)
    expect(popcount(1)).toBe(1)
    expect(popcount(ALL_SQUARES)).toBe(32)
    expect(popcount(RANK_8)).toBe(4)
    expect(popcount(0x00000fff)).toBe(12)
    expect(popcount(0xfff00000 | 0)).toBe(12)
  })

  it('reverses bits as a 180° turn', () => {
    expect(reverse32(1)).toBe(bit(31))
    expect(reverse32(RANK_1)).toBe(RANK_8)
    expect(reverse32(reverse32(0x12345678))).toBe(0x12345678)
    for (let sq = 0; sq < 32; sq++) {
      expect(reverse32(bit(sq))).toBe(bit(31 - sq))
    }
  })
})

describe('rays', () => {
  it('equal repeated steps to the edge', () => {
    for (let sq = 0; sq < 32; sq++) {
      for (const { dir } of DIRECTIONS) {
        let expected = 0
        for (let b = step(bit(sq), dir); b !== 0; b = step(b, dir)) {
          expected |= b
        }
        expect(ray(sq, dir)).toBe(expected)
      }
    }
  })

  it('walk the main diagonal and short diagonals', () => {
    expect(squareNames32(ray(squareFromName32('a1'), UP_RIGHT))).toEqual([
      'b2',
      'c3',
      'd4',
      'e5',
      'f6',
      'g7',
      'h8',
    ])
    expect(squareNames32(ray(squareFromName32('d4'), DOWN_LEFT))).toEqual([
      'a1',
      'b2',
      'c3',
    ])
    expect(ray(squareFromName32('a1'), UP_LEFT)).toBe(0)
    expect(ray(squareFromName32('h8'), DOWN_RIGHT)).toBe(0)
  })
})
