import { squareFromName, squareName } from '../game/board.ts'
import type { Piece, Position } from '../game/types.ts'
import { MEN } from './board.ts'

/**
 * Position literal for tests, fixtures and the worker request, in the
 * shape of the checkers one: `W:Wa1,b1,c1:Bf6,g6,h6` — side to move, white
 * men, black men; either list may be empty, and neither may hold more men
 * than the target has squares, since such a side could never finish. A
 * trailing `:N` is the number of plies already played, which the blocking
 * rules count. No kings: the game has none.
 */
export function parseCorners(text: string): Position {
  const parts = text.split(':')
  const [sideText, whiteText, blackText, plyText] = parts
  if (parts.length < 3 || parts.length > 4) {
    throw new Error(`invalid position literal: ${text}`)
  }
  if (sideText !== 'W' && sideText !== 'B') {
    throw new Error(`invalid side: ${sideText}`)
  }
  if (!whiteText?.startsWith('W') || !blackText?.startsWith('B')) {
    throw new Error(`invalid position literal: ${text}`)
  }
  const board: (Piece | undefined)[] = new Array<Piece | undefined>(64).fill(
    undefined,
  )
  const place = (list: string, color: 'white' | 'black'): void => {
    if (list === '') return
    const names = list.split(',')
    if (names.length > MEN) throw new Error(`too many ${color} men: ${list}`)
    for (const name of names) {
      const sq = squareFromName(name)
      if (board[sq] !== undefined) throw new Error(`square used twice: ${name}`)
      board[sq] = { color, kind: 'man' }
    }
  }
  place(whiteText.slice(1), 'white')
  place(blackText.slice(1), 'black')
  const ply = plyText === undefined ? 0 : Number(plyText)
  if (plyText === '' || !Number.isInteger(ply) || ply < 0) {
    throw new Error(`invalid ply count: ${plyText}`)
  }
  return {
    board,
    toMove: sideText === 'W' ? 'white' : 'black',
    drawCounter: 0,
    ply,
  }
}

/** Canonical inverse of `parseCorners`: squares in index order. */
export function formatCorners(position: Position): string {
  const list = (color: 'white' | 'black'): string => {
    const names: string[] = []
    position.board.forEach((piece, sq) => {
      if (piece?.color === color) names.push(squareName(sq))
    })
    return names.join(',')
  }
  const side = position.toMove === 'white' ? 'W' : 'B'
  const suffix = position.ply === 0 ? '' : `:${position.ply}`
  return `${side}:W${list('white')}:B${list('black')}${suffix}`
}
