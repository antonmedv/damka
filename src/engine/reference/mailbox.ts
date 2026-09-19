/**
 * Reference move generator on the UI's 64-cell board, written the obvious
 * way so it can be checked against RULES.md line by line. It is the oracle
 * for the bitboard generator and the benchmark baseline. Slow on purpose.
 */
import { fileOf, rankOf, squareAt } from '../../game/board.ts'
import type {
  Board,
  Color,
  Move,
  Piece,
  Position,
  Square,
} from '../../game/types.ts'
import { moveKey } from '../move.ts'
import type { DetailedMove } from '../move.ts'

type Direction = { readonly df: number; readonly dr: number }

const UP_LEFT: Direction = { df: -1, dr: 1 }
const UP_RIGHT: Direction = { df: 1, dr: 1 }
const DOWN_LEFT: Direction = { df: -1, dr: -1 }
const DOWN_RIGHT: Direction = { df: 1, dr: -1 }
const ALL_DIRECTIONS = [UP_LEFT, UP_RIGHT, DOWN_LEFT, DOWN_RIGHT]

function forwardDirections(color: Color): Direction[] {
  return color === 'white' ? [UP_LEFT, UP_RIGHT] : [DOWN_LEFT, DOWN_RIGHT]
}

function promotionRank(color: Color): number {
  return color === 'white' ? 7 : 0
}

/** Neighbouring square in `dir`, or -1 off the board. */
function neighbour(sq: Square, dir: Direction): Square {
  const file = fileOf(sq) + dir.df
  const rank = rankOf(sq) + dir.dr
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return -1
  return squareAt(file, rank)
}

/** One capture sequence in progress; the board itself never changes. */
type Sequence = {
  readonly board: Board
  readonly color: Color
  readonly origin: Square
  readonly originKing: boolean
  readonly out: DetailedMove[]
}

/** The origin is vacated for the whole sequence (RULES.md, Multiple Captures). */
function isEmpty(seq: Sequence, sq: Square): boolean {
  return sq === seq.origin || seq.board[sq] === undefined
}

/** Captured pieces stay on the board and cannot be captured again. */
function isCapturable(
  seq: Sequence,
  sq: Square,
  captured: ReadonlyArray<Square>,
): boolean {
  const piece = seq.board[sq]
  return (
    piece !== undefined && piece.color !== seq.color && !captured.includes(sq)
  )
}

function emit(
  seq: Sequence,
  path: ReadonlyArray<Square>,
  captured: ReadonlyArray<Square>,
  king: boolean,
): void {
  const to = path[path.length - 1]
  if (to === undefined) throw new Error('empty path')
  seq.out.push({
    from: seq.origin,
    to,
    captures: captured,
    promotes: king && !seq.originKing,
    path,
  })
}

/** Whether the piece on `sq` could capture something now. */
function canCapture(
  seq: Sequence,
  sq: Square,
  king: boolean,
  captured: ReadonlyArray<Square>,
): boolean {
  for (const dir of ALL_DIRECTIONS) {
    let target = neighbour(sq, dir)
    if (king) {
      while (target >= 0 && isEmpty(seq, target))
        target = neighbour(target, dir)
    }
    if (target < 0 || !isCapturable(seq, target, captured)) continue
    const landing = neighbour(target, dir)
    if (landing >= 0 && isEmpty(seq, landing)) return true
  }
  return false
}

/**
 * Extends the capture sequence from `sq`. Emits every complete sequence;
 * a sequence is complete only where no further capture exists.
 */
function captureFrom(
  seq: Sequence,
  sq: Square,
  king: boolean,
  captured: ReadonlyArray<Square>,
  path: ReadonlyArray<Square>,
): void {
  let continued = false
  for (const dir of ALL_DIRECTIONS) {
    if (!king) {
      const target = neighbour(sq, dir)
      if (target < 0 || !isCapturable(seq, target, captured)) continue
      const landing = neighbour(target, dir)
      if (landing < 0 || !isEmpty(seq, landing)) continue
      continued = true
      // A man that reaches the back rank is a king at once and goes on as one.
      const promoted = rankOf(landing) === promotionRank(seq.color)
      captureFrom(
        seq,
        landing,
        promoted,
        [...captured, target],
        [...path, landing],
      )
      continue
    }

    // King: first piece on the ray must be capturable, then any empty
    // square behind it is a landing square, up to the next piece or edge.
    let target = neighbour(sq, dir)
    while (target >= 0 && isEmpty(seq, target)) target = neighbour(target, dir)
    if (target < 0 || !isCapturable(seq, target, captured)) continue
    const landings: Square[] = []
    for (
      let landing = neighbour(target, dir);
      landing >= 0 && isEmpty(seq, landing);
      landing = neighbour(landing, dir)
    ) {
      landings.push(landing)
    }
    if (landings.length === 0) continue
    continued = true
    const nowCaptured = [...captured, target]
    // If the king can keep capturing from some landing squares it must
    // land on one of those; otherwise every landing square ends the move.
    const continuing = landings.filter((l) =>
      canCapture(seq, l, true, nowCaptured),
    )
    if (continuing.length > 0) {
      for (const landing of continuing) {
        captureFrom(seq, landing, true, nowCaptured, [...path, landing])
      }
    } else {
      for (const landing of landings) {
        emit(seq, [...path, landing], nowCaptured, true)
      }
    }
  }
  if (!continued && captured.length > 0) emit(seq, path, captured, king)
}

function quietMoves(
  board: Board,
  color: Color,
  from: Square,
  king: boolean,
  out: DetailedMove[],
): void {
  if (king) {
    for (const dir of ALL_DIRECTIONS) {
      for (
        let to = neighbour(from, dir);
        to >= 0 && board[to] === undefined;
        to = neighbour(to, dir)
      ) {
        out.push({ from, to, captures: [], promotes: false, path: [to] })
      }
    }
    return
  }
  for (const dir of forwardDirections(color)) {
    const to = neighbour(from, dir)
    if (to < 0 || board[to] !== undefined) continue
    const promotes = rankOf(to) === promotionRank(color)
    out.push({ from, to, captures: [], promotes, path: [to] })
  }
}

/**
 * Every legal move for the side to move, one entry per capture path.
 * Captures are mandatory: when any exist, only captures are returned.
 */
export function mailboxMoves(position: Position): DetailedMove[] {
  const { board, toMove } = position
  const captures: DetailedMove[] = []
  const quiet: DetailedMove[] = []
  board.forEach((piece, from) => {
    if (piece === undefined || piece.color !== toMove) return
    const king = piece.kind === 'king'
    const seq: Sequence = {
      board,
      color: toMove,
      origin: from,
      originKing: king,
      out: captures,
    }
    captureFrom(seq, from, king, [], [])
    quietMoves(board, toMove, from, king, quiet)
  })
  return captures.length > 0 ? captures : quiet
}

/**
 * Applies a legal move with the full rules: captures removed, promotion,
 * and the draw counter (quiet king moves count, anything else resets).
 */
export function mailboxApply(position: Position, move: Move): Position {
  const piece = position.board[move.from]
  if (piece === undefined) throw new Error(`no piece on ${move.from}`)
  const board: (Piece | undefined)[] = position.board.slice()
  for (const sq of move.captures) board[sq] = undefined
  board[move.from] = undefined
  board[move.to] = move.promotes ? { color: piece.color, kind: 'king' } : piece
  const quietKingMove = move.captures.length === 0 && piece.kind === 'king'
  return {
    board,
    toMove: position.toMove === 'white' ? 'black' : 'white',
    drawCounter: quietKingMove ? position.drawCounter + 1 : 0,
    ply: position.ply + 1,
  }
}

/** Distinct moves by outcome (paths to the same position collapse). */
export function uniqueMoves(
  moves: ReadonlyArray<DetailedMove>,
): DetailedMove[] {
  const seen = new Map<string, DetailedMove>()
  for (const move of moves) {
    const key = moveKey(move)
    if (!seen.has(key)) seen.set(key, move)
  }
  return [...seen.values()]
}

/** Leaf count of the move tree, counting distinct moves. */
export function mailboxPerft(position: Position, depth: number): number {
  if (depth === 0) return 1
  const moves = uniqueMoves(mailboxMoves(position))
  if (depth === 1) return moves.length
  let nodes = 0
  for (const move of moves) {
    nodes += mailboxPerft(mailboxApply(position, move), depth - 1)
  }
  return nodes
}
