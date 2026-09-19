import type {
  Board,
  GameVariant,
  Move,
  Piece,
  Position,
} from '../game/types.ts'
import { fromSquare64, lsb, toSquare64, bit } from './bitboard.ts'
import { moveFrom, movePromotes, moveTo } from './move.ts'
import { generateDetailed } from './movegen.ts'
import { BLACK, WHITE, formatPos } from './position.ts'
import type { BitPosition } from './position.ts'
import { CHECKERS, GIVEAWAY } from './variant.ts'
import type { Variant } from './variant.ts'

/** UI variant → engine variant. */
export function toVariant(variant: GameVariant): Variant {
  return variant === 'giveaway' ? GIVEAWAY : CHECKERS
}

/** UI position → engine position. Light squares must be empty. */
export function toBitPosition(
  position: Position,
  plies = position.drawCounter,
): BitPosition {
  let white = 0
  let black = 0
  let kings = 0
  position.board.forEach((piece, sq64) => {
    if (piece === undefined) return
    const b = bit(fromSquare64(sq64))
    if (piece.color === 'white') white |= b
    else black |= b
    if (piece.kind === 'king') kings |= b
  })
  return {
    white,
    black,
    kings,
    side: position.toMove === 'white' ? WHITE : BLACK,
    plies,
  }
}

/** Engine position → UI position. */
export function fromBitPosition(p: BitPosition): Position {
  const board: (Piece | undefined)[] = new Array<Piece | undefined>(64).fill(
    undefined,
  )
  const place = (pieces: number, color: 'white' | 'black'): void => {
    for (let rest = pieces; rest !== 0; rest &= rest - 1) {
      const sq = lsb(rest)
      const kind = ((p.kings >>> sq) & 1) !== 0 ? 'king' : 'man'
      board[toSquare64(sq)] = { color, kind }
    }
  }
  place(p.white, 'white')
  place(p.black, 'black')
  const result: Board = board
  return {
    board: result,
    toMove: p.side === WHITE ? 'white' : 'black',
    drawCounter: p.plies,
    ply: 0,
  }
}

/**
 * The UI move for the packed move (`m0`, `m1`) in `p`: same origin, landing
 * square, promotion and captured set; the first path with that outcome.
 */
export function detailedOf(p: BitPosition, m0: number, m1: number): Move {
  const from = moveFrom(m0)
  const to = moveTo(m0)
  const promotes = movePromotes(m0) !== 0
  for (const move of generateDetailed(p)) {
    if (
      fromSquare64(move.from) !== from ||
      fromSquare64(move.to) !== to ||
      move.promotes !== promotes
    ) {
      continue
    }
    let captured = 0
    for (const sq64 of move.captures) captured |= bit(fromSquare64(sq64))
    if (captured === m1) return move
  }
  throw new Error(`packed move ${m0},${m1} is not legal in ${formatPos(p)}`)
}
