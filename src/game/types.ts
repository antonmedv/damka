export type Color = 'white' | 'black'

export type PieceKind = 'man' | 'king'

/** Board square index 0..63: a1 = 0, b1 = 1, ..., h8 = 63. */
export type Square = number

export type Piece = {
  readonly color: Color
  readonly kind: PieceKind
}

/** 64 cells; only dark squares ever hold a piece. */
export type Board = ReadonlyArray<Piece | undefined>

export type Move = {
  readonly from: Square
  readonly to: Square
  /** Squares of captured pieces, in jump order; empty for a quiet move. */
  readonly captures: ReadonlyArray<Square>
  /** True when the moving man ends the move as a king. */
  readonly promotes: boolean
  /**
   * Squares the piece lands on, in order; the last one is `to`. A quiet
   * move has the single entry `[to]`. Two moves may share `from`, `to` and
   * `captures` and still differ in path.
   */
  readonly path: ReadonlyArray<Square>
}

export type Position = {
  readonly board: Board
  readonly toMove: Color
  /**
   * Consecutive plies in which only kings made quiet moves. RULES.md draws
   * the game at 30; a capture or a man move resets it.
   */
  readonly drawCounter: number
}

export type GameStatus = 'ongoing' | 'whiteWins' | 'blackWins' | 'draw'
