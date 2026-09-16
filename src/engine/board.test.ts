import { describe, expect, it } from 'vitest'
import { formatBoard, formatMove, formatSide } from './board.ts'
import { squareFromName32 } from './bitboard.ts'
import { packMove } from './move.ts'
import { initialBitPosition, parsePos } from './position.ts'

const move = (from: string, to: string, promotes = 0, captures = 0): number =>
  packMove(squareFromName32(from), squareFromName32(to), promotes, captures)

describe('formatBoard', () => {
  it('draws the initial position with white at the bottom', () => {
    expect(formatBoard(initialBitPosition())).toBe(
      [
        '  a b c d e f g h',
        '8   x   x   x   x 8',
        '7 x   x   x   x   7',
        '6   x   x   x   x 6',
        '5 .   .   .   .   5',
        '4   .   .   .   . 4',
        '3 o   o   o   o   3',
        '2   o   o   o   o 2',
        '1 o   o   o   o   1',
        '  a b c d e f g h',
      ].join('\n'),
    )
  })

  it('marks kings with capitals', () => {
    const lines = formatBoard(parsePos('W:WKa1:BKh8')).split('\n')
    expect(lines[1]).toBe('8   .   .   .   X 8')
    expect(lines[8]).toBe('1 O   .   .   .   1')
  })
})

describe('formatSide', () => {
  it('names the side to move and the draw counter', () => {
    expect(formatSide(initialBitPosition())).toBe('white to move')
    expect(formatSide(parsePos('B:WKa1:BKh8:7'))).toBe('black to move, 7 plies')
  })
})

describe('formatMove', () => {
  it('writes quiet moves, captures and promotions', () => {
    expect(formatMove(move('c3', 'd4'))).toBe('c3-d4')
    expect(formatMove(move('c3', 'e5', 0, 1))).toBe('c3:e5')
    expect(formatMove(move('c7', 'b8', 1))).toBe('c7-b8=K')
    expect(formatMove(move('c5', 'e7', 1, 1))).toBe('c5:e7=K')
  })
})
