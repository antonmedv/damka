import { memo } from 'react'
import type { MouseEvent } from 'react'
import { isDark, squareName } from '../game/board.ts'
import type {
  Piece as PieceModel,
  Square as SquareIndex,
} from '../game/types.ts'
import { t } from '../i18n/index.ts'
import { Piece } from './Piece.tsx'

type SquareProps = {
  square: SquareIndex
  piece: PieceModel | undefined
  /** The piece is being shown elsewhere (lifted by a drag). */
  hidePiece?: boolean
  /** Piece belongs to the side to move. */
  movable?: boolean
  selected?: boolean
  /** Legal destination for the selected piece. */
  target?: boolean
  /** Target currently under a dragged piece. */
  hover?: boolean
  lastFrom?: boolean
  lastTo?: boolean
  /** Intermediate landing square of the last move. */
  lastPath?: boolean
  /** The piece is flying in along the last move's path. */
  arriving?: boolean
  tabIndex?: number
  onFocus?: (square: SquareIndex) => void
  onTap?: (square: SquareIndex) => void
}

/**
 * Memoised: a drag re-renders the board on every pointer move, and only the
 * squares whose hover or hidden state changed need to redo their work.
 */
export const Square = memo(function Square({
  square,
  piece,
  hidePiece = false,
  movable = false,
  selected = false,
  target = false,
  hover = false,
  lastFrom = false,
  lastTo = false,
  lastPath = false,
  arriving = false,
  tabIndex,
  onFocus,
  onTap,
}: SquareProps) {
  const classes = [
    'board__square',
    `board__square--${isDark(square) ? 'dark' : 'light'}`,
    movable && 'board__square--movable',
    selected && 'board__square--selected',
    target && 'board__square--target',
    hover && 'board__square--target-hover',
    lastFrom && 'board__square--last-from',
    lastTo && 'board__square--last-to',
    lastPath && 'board__square--last-path',
  ]
    .filter(Boolean)
    .join(' ')

  const content = piece ? t.piece[piece.color][piece.kind] : t.emptySquare
  const hint = target ? t.targetHint : selected ? t.selectedHint : null
  const label = t.squareLabel(
    squareName(square),
    hint === null ? content : `${content}, ${hint}`,
  )

  // Pointer taps are handled by the board's drag hook; only keyboard
  // activation (detail === 0) reaches here, so a drag never double-fires.
  function onClick(e: MouseEvent<HTMLButtonElement>) {
    if (e.detail === 0) onTap?.(square)
  }

  return (
    <button
      type="button"
      className={classes}
      aria-label={label}
      data-square={square}
      tabIndex={tabIndex}
      onFocus={() => onFocus?.(square)}
      onClick={onClick}
    >
      {piece && !hidePiece && (
        <span
          className={
            arriving ? 'board__piece board__piece--arrived' : 'board__piece'
          }
        >
          <Piece color={piece.color} kind={piece.kind} />
        </span>
      )}
    </button>
  )
})
