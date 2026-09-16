import { opposite, pieceAt } from './board.ts'
import type { Move, Piece, Position } from './types.ts'

/**
 * Returns the position after `move`; never mutates `position`. Captured
 * pieces leave the board only now, at the end of the whole sequence. The
 * draw counter counts quiet king moves and resets on any capture or man
 * move (a promotion is a man move).
 */
export function applyMove(position: Position, move: Move): Position {
  const piece = pieceAt(position.board, move.from)
  if (piece === undefined) {
    throw new Error(`no piece on square ${move.from}`)
  }
  const board: (Piece | undefined)[] = position.board.slice()
  for (const square of move.captures) board[square] = undefined
  board[move.from] = undefined
  board[move.to] = move.promotes ? { color: piece.color, kind: 'king' } : piece
  const quietKingMove = move.captures.length === 0 && piece.kind === 'king'
  return {
    board,
    toMove: opposite(position.toMove),
    drawCounter: quietKingMove ? position.drawCounter + 1 : 0,
  }
}
