/**
 * The уголки board and the cells the engine plays on.
 *
 * Squares are the UI's own indices, a1 = 0 … h8 = 63 (`game/types.ts`), so
 * nothing is converted at the boundary. A cell holds `EMPTY`, `WHITE_MAN`
 * or `BLACK_MAN`; a side is `WHITE` (0) or `BLACK` (1), and its man is
 * `side + 1`.
 *
 * This is a mailbox engine, unlike the checkers one. Sixty-four squares do
 * not fit one int32, and the game has no bit-parallel structure worth two:
 * a move is a walk from one man's square, so the generator walks. The
 * board is loaded into `BOARD` once per search and mutated in place by
 * `apply.ts`; `WORDS` carries the same position as four bitboard words for
 * the transposition table, where it is compared exactly.
 *
 * Geometry is White's and turned 180° for Black (`sq → 63 - sq`): White's
 * home is a1–c3 and its target Black's home, f6–h8.
 */
import type { Color, Piece, Position, Square } from '../game/types.ts'

export const WHITE = 0
export const BLACK = 1

export const EMPTY = 0
export const WHITE_MAN = 1
export const BLACK_MAN = 2

/** Men of `side`, as a cell value. */
export function manOf(side: number): number {
  return side + 1
}

/** Men per side in a home of `HOME_SIZE` by `HOME_SIZE` squares. */
export const HOME_SIZE = 3
export const MEN = HOME_SIZE * HOME_SIZE

/** Directions of a step or a jump. */
export const LEFT = 0
export const RIGHT = 1
export const DOWN = 2
export const UP = 3

/** `NEIGHBOR[sq * 4 + dir]`: the square one step away, -1 off the board. */
export const NEIGHBOR: Int8Array = buildNeighbors()

/** The square as seen from the other side of the board. */
export function turned(sq: number): number {
  return 63 - sq
}

/**
 * Whether a move from `from` to `to` is a step to a neighbour rather than
 * a jump: one file or one rank apart, never both.
 */
export function isStep(from: number, to: number): boolean {
  const span = Math.abs(to - from)
  return span === 1 || span === 8
}

/** Squares of White's home, a1–c3, in index order. */
export const WHITE_HOME: ReadonlyArray<number> = buildHome()
/** Squares of Black's home, f6–h8. */
export const BLACK_HOME: ReadonlyArray<number> = WHITE_HOME.map(turned)

/** `HOME[side]`: the side's own home; `TARGET[side]`: the home it races to. */
export const HOME: ReadonlyArray<ReadonlyArray<number>> = [
  WHITE_HOME,
  BLACK_HOME,
]
export const TARGET: ReadonlyArray<ReadonlyArray<number>> = [
  BLACK_HOME,
  WHITE_HOME,
]

/**
 * `TARGET_DISTANCE[side * 64 + sq]`: Manhattan distance from `sq` to the
 * nearest square of the side's target; 0 inside it. How far a man still
 * has to walk, before jumps.
 */
export const TARGET_DISTANCE: Uint8Array = buildTargetDistance()

/**
 * `CORNER_DISTANCE[side * 64 + sq]`: for a square inside the side's
 * target, the Manhattan distance to the target's far corner (h8 for
 * White); 0 elsewhere. How deep in the target a man has settled.
 */
export const CORNER_DISTANCE: Uint8Array = buildCornerDistance()

/** The board a search plays on; see `load`. */
export const BOARD = new Uint8Array(64)

/**
 * The same position as bitboards, for the transposition table: White's
 * men in words 0 (a1–h4) and 1 (a5–h8), Black's in 2 and 3.
 */
export const WORDS = new Int32Array(4)

/** Men of each side on the loaded board, so "all men home" is a count. */
export const COUNT = new Int32Array(2)

/** Puts `position` on `BOARD`, `WORDS` and `COUNT`; the search starts here. */
export function load(position: Position): void {
  BOARD.fill(EMPTY)
  WORDS.fill(0)
  COUNT.fill(0)
  position.board.forEach((piece, sq) => {
    if (piece === undefined) return
    const side = sideOf(piece.color)
    BOARD[sq] = manOf(side)
    const word = side * 2 + (sq >> 5)
    WORDS[word] = WORDS[word]! | (1 << (sq & 31))
    COUNT[side] = COUNT[side]! + 1
  })
}

/** Men of `man` standing on `squares` of the loaded board. */
export function countOn(squares: ReadonlyArray<number>, man: number): number {
  let count = 0
  for (let i = 0; i < squares.length; i++) {
    if (BOARD[squares[i]!] === man) count++
  }
  return count
}

export function sideOf(color: Color): number {
  return color === 'white' ? WHITE : BLACK
}

export function colorOf(side: number): Color {
  return side === WHITE ? 'white' : 'black'
}

/** Nine men in each home, White to move. */
export function initialPosition(): Position {
  const board: (Piece | undefined)[] = new Array<Piece | undefined>(64).fill(
    undefined,
  )
  for (const sq of WHITE_HOME) board[sq] = { color: 'white', kind: 'man' }
  for (const sq of BLACK_HOME) board[sq] = { color: 'black', kind: 'man' }
  return { board, toMove: 'white', drawCounter: 0, ply: 0 }
}

/**
 * Squares of `color`'s men still to cover to reach the target, summed over
 * its men: the distance the side has left in the race. The result screen
 * plots it.
 */
export function distanceLeft(position: Position, color: Color): number {
  const side = sideOf(color)
  let left = 0
  position.board.forEach((piece, sq) => {
    if (piece?.color === color) left += TARGET_DISTANCE[side * 64 + sq]!
  })
  return left
}

/**
 * Squares of `color`'s men still in their own home, in square order. The
 * screen warns about them as the home deadline nears and points them out
 * once it has passed.
 */
export function menAtHome(position: Position, color: Color): Square[] {
  return HOME[sideOf(color)]!.filter(
    (sq) => position.board[sq]?.color === color,
  )
}

/**
 * ASCII board for the console, in the checkers engine's picture: white at
 * the bottom, `o` a white man, `x` a black one, `.` an empty square.
 */
export function formatBoard(position: Position): string {
  const legend = '  a b c d e f g h'
  const lines = [legend]
  for (let rank = 7; rank >= 0; rank--) {
    let row = `${rank + 1}`
    for (let file = 0; file < 8; file++) {
      const piece = position.board[rank * 8 + file]
      row += ` ${piece === undefined ? '.' : piece.color === 'white' ? 'o' : 'x'}`
    }
    lines.push(`${row} ${rank + 1}`)
  }
  lines.push(legend)
  return lines.join('\n')
}

function buildNeighbors(): Int8Array {
  const table = new Int8Array(256)
  for (let sq = 0; sq < 64; sq++) {
    const file = sq & 7
    const rank = sq >> 3
    table[sq * 4 + LEFT] = file > 0 ? sq - 1 : -1
    table[sq * 4 + RIGHT] = file < 7 ? sq + 1 : -1
    table[sq * 4 + DOWN] = rank > 0 ? sq - 8 : -1
    table[sq * 4 + UP] = rank < 7 ? sq + 8 : -1
  }
  return table
}

function buildHome(): number[] {
  const home: number[] = []
  for (let rank = 0; rank < HOME_SIZE; rank++) {
    for (let file = 0; file < HOME_SIZE; file++) home.push(rank * 8 + file)
  }
  return home
}

function manhattan(a: number, b: number): number {
  return Math.abs((a & 7) - (b & 7)) + Math.abs((a >> 3) - (b >> 3))
}

function buildTargetDistance(): Uint8Array {
  const table = new Uint8Array(128)
  for (let side = 0; side < 2; side++) {
    for (let sq = 0; sq < 64; sq++) {
      table[side * 64 + sq] = Math.min(
        ...TARGET[side]!.map((home) => manhattan(sq, home)),
      )
    }
  }
  return table
}

function buildCornerDistance(): Uint8Array {
  const table = new Uint8Array(128)
  for (let side = 0; side < 2; side++) {
    const corner = side === WHITE ? 63 : 0
    for (const sq of TARGET[side]!) {
      table[side * 64 + sq] = manhattan(sq, corner)
    }
  }
  return table
}
