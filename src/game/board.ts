import type { Board, Color, Piece, Position, Square } from './types.ts'

const FILES = 'abcdefgh'

export function fileOf(square: Square): number {
  return square % 8
}

export function rankOf(square: Square): number {
  return Math.floor(square / 8)
}

export function squareAt(file: number, rank: number): Square {
  return rank * 8 + file
}

/** a1 is dark; dark squares are the only playable ones. */
export function isDark(square: Square): boolean {
  return (fileOf(square) + rankOf(square)) % 2 === 0
}

export function squareName(square: Square): string {
  return `${FILES[fileOf(square)]}${rankOf(square) + 1}`
}

export function squareFromName(name: string): Square {
  const file = FILES.indexOf(name.charAt(0))
  const rank = Number(name.charAt(1)) - 1
  if (file < 0 || rank < 0 || rank > 7 || Number.isNaN(rank)) {
    throw new Error(`invalid square name: ${name}`)
  }
  return squareAt(file, rank)
}

export function opposite(color: Color): Color {
  return color === 'white' ? 'black' : 'white'
}

export function pieceAt(board: Board, square: Square): Piece | undefined {
  return board[square]
}

/** 12 men per side on the dark squares of the three nearest ranks. */
export function initialPosition(): Position {
  const board: (Piece | undefined)[] = new Array<Piece | undefined>(64).fill(
    undefined,
  )
  for (let square = 0; square < 64; square++) {
    if (!isDark(square)) continue
    const rank = rankOf(square)
    if (rank <= 2) board[square] = { color: 'white', kind: 'man' }
    if (rank >= 5) board[square] = { color: 'black', kind: 'man' }
  }
  return { board, toMove: 'white', drawCounter: 0 }
}

export type Cell = { row: number; col: number }

/** Square shown at grid cell (row 0 = top, col 0 = left). */
export function squareAtDisplay(
  row: number,
  col: number,
  bottom: Color,
): Square {
  return bottom === 'white' ? squareAt(col, 7 - row) : squareAt(7 - col, row)
}

/** Grid cell where `square` is shown; inverse of squareAtDisplay. */
export function displayCell(square: Square, bottom: Color): Cell {
  const file = fileOf(square)
  const rank = rankOf(square)
  return bottom === 'white'
    ? { row: 7 - rank, col: file }
    : { row: rank, col: 7 - file }
}

/**
 * Square indices in reading order (top-left to bottom-right) for a board
 * shown with `bottom` colour nearest the viewer.
 */
export function displayOrder(bottom: Color): Square[] {
  const order: Square[] = []
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      order.push(squareAtDisplay(row, col, bottom))
    }
  }
  return order
}

export type Rect = { left: number; top: number; width: number; height: number }

/**
 * Square under viewport point (x, y) given the grid's bounding rect. A point
 * up to `slack` cells outside the grid still resolves to the nearest edge
 * square, so a piece dropped half over the frame lands on the board.
 */
export function squareAtPoint(
  rect: Rect,
  x: number,
  y: number,
  bottom: Color,
  slack = 0,
): Square | null {
  const fx = ((x - rect.left) / rect.width) * 8
  const fy = ((y - rect.top) / rect.height) * 8
  if (fx < -slack || fx >= 8 + slack || fy < -slack || fy >= 8 + slack) {
    return null
  }
  const col = Math.min(7, Math.max(0, Math.floor(fx)))
  const row = Math.min(7, Math.max(0, Math.floor(fy)))
  return squareAtDisplay(row, col, bottom)
}

/** Viewport centre of `square` given the grid's bounding rect. */
export function squareCenter(
  rect: Rect,
  square: Square,
  bottom: Color,
): { x: number; y: number } {
  const { row, col } = displayCell(square, bottom)
  return {
    x: rect.left + ((col + 0.5) * rect.width) / 8,
    y: rect.top + ((row + 0.5) * rect.height) / 8,
  }
}
