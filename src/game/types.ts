export type Color = 'white' | 'black'

export type PieceKind = 'man' | 'king'

/** Board square index 0..63: a1 = 0, b1 = 1, ..., h8 = 63. */
export type Square = number

export type Piece = {
  readonly color: Color
  readonly kind: PieceKind
}

/** 64 cells. At checkers only dark squares ever hold a piece; at уголки any square may. */
export type Board = ReadonlyArray<Piece | undefined>

export type Move = {
  readonly from: Square
  readonly to: Square
  /** Squares of captured pieces, in jump order; empty for a quiet move. */
  readonly captures: ReadonlyArray<Square>
  /** True when the moving man ends the move as a king. */
  readonly promotes: boolean
  /**
   * Squares the piece lands on, in order; the last one is `to`. A step has
   * the single entry `[to]`. At checkers two moves may share `from`, `to`
   * and `captures` and still differ in path; an уголки jump chain has one
   * path per destination, the shortest, since nothing on the way matters.
   */
  readonly path: ReadonlyArray<Square>
}

export type Position = {
  readonly board: Board
  readonly toMove: Color
  /**
   * Consecutive plies in which only kings made quiet moves. RULES.md draws
   * the game at 30; a capture or a man move resets it. Always 0 at уголки,
   * which has no kings.
   */
  readonly drawCounter: number
  /**
   * Plies played to reach this position from where the game began. The
   * уголки blocking rules read it; checkers ignores it.
   */
  readonly ply: number
}

export type GameStatus = 'ongoing' | 'whiteWins' | 'blackWins' | 'draw'

/**
 * Which game is being played. Checkers and поддавки share every rule of
 * movement and capture and disagree only on who wins when a side cannot
 * move; уголки is a race on the same board with rules of its own. See
 * RULES.md, and `engine/variant.ts` for the form the checkers engine uses.
 */
export type GameVariant = 'checkers' | 'giveaway' | 'corners'

/** Every game, in the order the navbar shows them. */
export const gameVariants: ReadonlyArray<GameVariant> = [
  'checkers',
  'giveaway',
  'corners',
]
