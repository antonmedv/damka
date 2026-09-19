import { describe, expect, it } from 'vitest'
import {
  displayCell,
  squareAtPoint,
  squareCenter,
  displayOrder,
  fileOf,
  initialPosition,
  isDark,
  opposite,
  pieceAt,
  rankOf,
  squareFromName,
  squareName,
} from './board.ts'

describe('square geometry', () => {
  it('maps a1 to 0 and h8 to 63', () => {
    expect(squareFromName('a1')).toBe(0)
    expect(squareFromName('h8')).toBe(63)
    expect(squareName(0)).toBe('a1')
    expect(squareName(63)).toBe('h8')
  })

  it('round-trips every square name', () => {
    for (let sq = 0; sq < 64; sq++) {
      expect(squareFromName(squareName(sq))).toBe(sq)
    }
  })

  it('splits index into file and rank', () => {
    const c3 = squareFromName('c3')
    expect(fileOf(c3)).toBe(2)
    expect(rankOf(c3)).toBe(2)
  })

  it('treats a1 as dark and b1 as light', () => {
    expect(isDark(squareFromName('a1'))).toBe(true)
    expect(isDark(squareFromName('b1'))).toBe(false)
    expect(isDark(squareFromName('h8'))).toBe(true)
  })

  it('has exactly 32 dark squares', () => {
    let count = 0
    for (let sq = 0; sq < 64; sq++) if (isDark(sq)) count++
    expect(count).toBe(32)
  })

  it('flips colours', () => {
    expect(opposite('white')).toBe('black')
    expect(opposite('black')).toBe('white')
  })
})

describe('initialPosition', () => {
  const { board, toMove } = initialPosition('checkers')

  it('gives white the first move', () => {
    expect(toMove).toBe('white')
  })

  it('places 12 white men on ranks 1-3 and 12 black men on ranks 6-8', () => {
    const white = []
    const black = []
    for (let sq = 0; sq < 64; sq++) {
      const piece = pieceAt(board, sq)
      if (piece?.color === 'white') white.push(sq)
      if (piece?.color === 'black') black.push(sq)
    }
    expect(white).toHaveLength(12)
    expect(black).toHaveLength(12)
    expect(white.every((sq) => rankOf(sq) <= 2)).toBe(true)
    expect(black.every((sq) => rankOf(sq) >= 5)).toBe(true)
  })

  it('puts every piece on a dark square as a man', () => {
    for (let sq = 0; sq < 64; sq++) {
      const piece = pieceAt(board, sq)
      if (piece === undefined) continue
      expect(isDark(sq)).toBe(true)
      expect(piece.kind).toBe('man')
    }
  })

  it('leaves ranks 4 and 5 empty', () => {
    for (let sq = 24; sq < 40; sq++) {
      expect(pieceAt(board, sq)).toBeUndefined()
    }
  })
})

describe('displayOrder', () => {
  it('lists a8 first and h1 last when white is at the bottom', () => {
    const order = displayOrder('white')
    expect(order).toHaveLength(64)
    expect(order[0]).toBe(squareFromName('a8'))
    expect(order[7]).toBe(squareFromName('h8'))
    expect(order[63]).toBe(squareFromName('h1'))
  })

  it('lists h1 first and a8 last when black is at the bottom', () => {
    const order = displayOrder('black')
    expect(order[0]).toBe(squareFromName('h1'))
    expect(order[7]).toBe(squareFromName('a1'))
    expect(order[63]).toBe(squareFromName('a8'))
  })
})

describe('display cells', () => {
  it('maps squares to grid cells for white at the bottom', () => {
    expect(displayCell(squareFromName('a8'), 'white')).toEqual({
      row: 0,
      col: 0,
    })
    expect(displayCell(squareFromName('h1'), 'white')).toEqual({
      row: 7,
      col: 7,
    })
    expect(displayCell(squareFromName('c3'), 'white')).toEqual({
      row: 5,
      col: 2,
    })
  })

  it('maps squares to grid cells for black at the bottom', () => {
    expect(displayCell(squareFromName('h1'), 'black')).toEqual({
      row: 0,
      col: 0,
    })
    expect(displayCell(squareFromName('a8'), 'black')).toEqual({
      row: 7,
      col: 7,
    })
  })

  it('is the inverse of displayOrder', () => {
    for (const bottom of ['white', 'black'] as const) {
      displayOrder(bottom).forEach((square, i) => {
        expect(displayCell(square, bottom)).toEqual({
          row: Math.floor(i / 8),
          col: i % 8,
        })
      })
    }
  })
})

describe('squareAtPoint', () => {
  const rect = { left: 100, top: 200, width: 800, height: 800 }

  it('finds the square under a point for white at the bottom', () => {
    expect(squareAtPoint(rect, 150, 250, 'white')).toBe(squareFromName('a8'))
    expect(squareAtPoint(rect, 350, 750, 'white')).toBe(squareFromName('c3'))
    expect(squareAtPoint(rect, 899, 999, 'white')).toBe(squareFromName('h1'))
  })

  it('finds the square under a point for black at the bottom', () => {
    expect(squareAtPoint(rect, 150, 250, 'black')).toBe(squareFromName('h1'))
    expect(squareAtPoint(rect, 899, 999, 'black')).toBe(squareFromName('a8'))
  })

  it('returns null outside the board', () => {
    expect(squareAtPoint(rect, 99, 250, 'white')).toBeNull()
    expect(squareAtPoint(rect, 150, 199, 'white')).toBeNull()
    expect(squareAtPoint(rect, 900, 250, 'white')).toBeNull()
    expect(squareAtPoint(rect, 150, 1000, 'white')).toBeNull()
  })

  it('snaps a point slightly outside the board to the edge square', () => {
    // Half a cell (50px) of slack: just past the frame still counts.
    expect(squareAtPoint(rect, 60, 250, 'white', 0.5)).toBe(
      squareFromName('a8'),
    )
    expect(squareAtPoint(rect, 940, 1040, 'white', 0.5)).toBe(
      squareFromName('h1'),
    )
    expect(squareAtPoint(rect, 940, 1040, 'black', 0.5)).toBe(
      squareFromName('a8'),
    )
    // Beyond the slack it is off the board.
    expect(squareAtPoint(rect, 49, 250, 'white', 0.5)).toBeNull()
    expect(squareAtPoint(rect, 150, 1051, 'white', 0.5)).toBeNull()
  })
})

describe('squareCenter', () => {
  const rect = { left: 100, top: 200, width: 800, height: 800 }

  it('is the middle of the cell for either orientation', () => {
    expect(squareCenter(rect, squareFromName('a8'), 'white')).toEqual({
      x: 150,
      y: 250,
    })
    expect(squareCenter(rect, squareFromName('c3'), 'white')).toEqual({
      x: 350,
      y: 750,
    })
    expect(squareCenter(rect, squareFromName('a8'), 'black')).toEqual({
      x: 850,
      y: 950,
    })
  })

  it('inverts squareAtPoint', () => {
    for (let sq = 0; sq < 64; sq++) {
      const { x, y } = squareCenter(rect, sq, 'black')
      expect(squareAtPoint(rect, x, y, 'black')).toBe(sq)
    }
  })
})
