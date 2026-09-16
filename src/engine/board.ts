/**
 * ASCII board for the console, the same picture as `board.go` in the Go
 * reference: white at the bottom, files a–h left to right, `o`/`O` a white
 * man/king, `x`/`X` a black one, `.` an empty dark square, light squares
 * blank.
 *
 *     a b c d e f g h
 *   8   x   x   x   x 8
 *   7 x   x   x   x   7
 *   …
 *   1 o   o   o   o   1
 *     a b c d e f g h
 */
import { bit, squareName32 } from './bitboard.ts'
import { moveCaptureCount, moveFrom, movePromotes, moveTo } from './move.ts'
import { WHITE } from './position.ts'
import type { BitPosition } from './position.ts'

const LEGEND = '  a b c d e f g h'

export function formatBoard(p: BitPosition): string {
  const lines = [LEGEND]
  for (let rank = 7; rank >= 0; rank--) {
    let row = `${rank + 1}`
    for (let file = 0; file < 8; file++) row += ` ${pieceChar(p, rank, file)}`
    lines.push(`${row} ${rank + 1}`)
  }
  lines.push(LEGEND)
  return lines.join('\n')
}

/** `white`/`black` plus the draw counter, the line above a board. */
export function formatSide(p: BitPosition): string {
  const side = p.side === WHITE ? 'white' : 'black'
  return p.plies === 0 ? `${side} to move` : `${side} to move, ${p.plies} plies`
}

/**
 * A packed move as `c3-d4` (quiet) or `c3:e5` (capture), `=K` when it
 * promotes. Only the ends of the path, which is all the move stack keeps.
 */
export function formatMove(m0: number): string {
  const separator = moveCaptureCount(m0) > 0 ? ':' : '-'
  const from = squareName32(moveFrom(m0))
  const to = squareName32(moveTo(m0))
  return `${from}${separator}${to}${movePromotes(m0) !== 0 ? '=K' : ''}`
}

function pieceChar(p: BitPosition, rank: number, file: number): string {
  if (((rank + file) & 1) !== 0) return ' '
  const b = bit(rank * 4 + (file >> 1))
  const king = (p.kings & b) !== 0
  if ((p.white & b) !== 0) return king ? 'O' : 'o'
  if ((p.black & b) !== 0) return king ? 'X' : 'x'
  return '.'
}
