import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import {
  displayCell,
  displayOrder,
  pieceAt,
  squareAtDisplay,
  squareAtPoint,
  squareCenter,
} from '../game/board.ts'
import type { Cell } from '../game/board.ts'
import type {
  Color,
  Move,
  Position,
  Square as SquareIndex,
} from '../game/types.ts'
import { t } from '../i18n/index.ts'
import { flightTo } from '../state/flight.ts'
import type { Flight } from '../state/flight.ts'
import { Piece } from './Piece.tsx'
import { useSlide } from './slide.ts'
import { Square } from './Square.tsx'
import { useDragPiece } from './useDragPiece.ts'
import type { DragState } from './useDragPiece.ts'
import './Board.css'

type BoardProps = {
  position: Position
  /** Colour shown nearest the viewer. */
  orientation: Color
  selected?: SquareIndex | null
  targets?: ReadonlyArray<SquareIndex>
  /** Pieces the player may pick up; defaults to every piece of the side to move. */
  movable?: ReadonlyArray<SquareIndex>
  /** Highlighted as the move that produced this position. */
  lastMove?: Move | null
  /** Men late to leave home at уголки, ringed as a warning. */
  overdue?: ReadonlyArray<SquareIndex>
  /** The piece at the end of this flight is flown in along its path. */
  slide?: Flight | null
  /** An earlier position is displayed. */
  reviewing?: boolean
  /** Input is suspended while the computer thinks. */
  busy?: boolean
  onSquareTap?: (square: SquareIndex) => void
  /** A drag has started on this piece. */
  onSelect?: (square: SquareIndex) => void
  /** A dragged piece was dropped on a target. */
  onMove?: (from: SquareIndex, to: SquareIndex) => void
  /** Escape pressed while the board has focus. */
  onEscape?: () => void
}

const ARROWS: Record<string, [number, number]> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
}

const FILES = 'abcdefgh'
const RANKS = [1, 2, 3, 4, 5, 6, 7, 8]
/** A piece dropped up to this many cells past the frame lands on the edge square. */
const DROP_SLACK = 0.5

export function Board({
  position,
  orientation,
  selected = null,
  targets = [],
  movable,
  lastMove = null,
  overdue = [],
  slide = null,
  reviewing = false,
  busy = false,
  onSquareTap,
  onSelect,
  onMove,
  onEscape,
}: BoardProps) {
  const gridRef = useRef<HTMLDivElement>(null)
  const gridRect = () => gridRef.current?.getBoundingClientRect() ?? null
  // Roving tabindex: one square is tabbable and arrows move focus. Tracked
  // as a visual cell so flipping the board keeps the entry point bottom-left.
  const [focusCell, setFocusCell] = useState<Cell>({ row: 7, col: 0 })
  const focused = squareAtDisplay(focusCell.row, focusCell.col, orientation)
  const onSquareFocus = useCallback(
    (square: SquareIndex) => setFocusCell(displayCell(square, orientation)),
    [orientation],
  )

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      onEscape?.()
      return
    }
    const step = ARROWS[e.key]
    if (step === undefined) return
    e.preventDefault()
    const next: Cell = {
      row: Math.min(7, Math.max(0, focusCell.row + step[0])),
      col: Math.min(7, Math.max(0, focusCell.col + step[1])),
    }
    if (next.row === focusCell.row && next.col === focusCell.col) return
    setFocusCell(next)
    const square = squareAtDisplay(next.row, next.col, orientation)
    gridRef.current
      ?.querySelector<HTMLButtonElement>(`[data-square="${square}"]`)
      ?.focus()
  }

  const isMovable = (square: SquareIndex): boolean =>
    movable === undefined
      ? pieceAt(position.board, square)?.color === position.toMove
      : movable.includes(square)
  const lastPath = lastMove?.path.slice(0, -1) ?? []

  const { drag, onPointerDown } = useDragPiece({
    canDrag: (square) => onMove !== undefined && isMovable(square),
    pieceAt: (square) => pieceAt(position.board, square),
    isTarget: (square) => targets.includes(square),
    squareAtPoint: (x, y) => {
      const rect = gridRect()
      return rect === null
        ? null
        : squareAtPoint(rect, x, y, orientation, DROP_SLACK)
    },
    squareCenter: (square) => {
      const rect = gridRect()
      return rect === null ? null : squareCenter(rect, square, orientation)
    },
    gridRect,
    onTap: (square) => onSquareTap?.(square),
    onDragStart: (square) => onSelect?.(square),
    onDrop: (from, to) => onMove?.(from, to),
  })

  useSlide(gridRef, slide, orientation)

  // The grabbing cursor has to show everywhere the pointer may wander.
  const dragging = drag?.phase === 'dragging'
  useEffect(() => {
    if (!dragging) return
    document.documentElement.classList.add('is-dragging')
    return () => document.documentElement.classList.remove('is-dragging')
  }, [dragging])

  const files = orientation === 'white' ? [...FILES] : [...FILES].reverse()
  const ranks = orientation === 'white' ? [...RANKS].reverse() : RANKS

  return (
    <div className={reviewing ? 'board board--review' : 'board'}>
      {reviewing && <div className="board__badge">{t.review}</div>}
      <div className="board__ranks" aria-hidden="true">
        {ranks.map((rank) => (
          <span key={rank}>{rank}</span>
        ))}
      </div>
      <div
        className={
          dragging ? 'board__grid board__grid--dragging' : 'board__grid'
        }
        ref={gridRef}
        aria-busy={busy || undefined}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
      >
        {displayOrder(orientation).map((square) => {
          const piece = pieceAt(position.board, square)
          return (
            <Square
              key={square}
              square={square}
              piece={piece}
              hidePiece={drag !== null && square === drag.landing}
              movable={piece !== undefined && isMovable(square)}
              selected={square === selected}
              target={targets.includes(square)}
              hover={drag?.over === square && targets.includes(square)}
              lastFrom={lastMove?.from === square}
              lastTo={lastMove?.to === square}
              lastPath={lastPath.includes(square)}
              overdue={overdue.includes(square)}
              arriving={slide !== null && flightTo(slide) === square}
              tabIndex={square === focused ? 0 : -1}
              onFocus={onSquareFocus}
              onTap={onSquareTap}
            />
          )
        })}
      </div>
      {drag !== null && (
        // Own layer over the grid: the grid clips to its frame, and a
        // dragged piece should be free to hang over the edge.
        <div className="board__drag-layer" aria-hidden="true">
          <div
            className={`board__lifted board__lifted--${drag.phase}`}
            style={liftedStyle(drag, orientation)}
          >
            <Piece color={drag.piece.color} kind={drag.piece.kind} />
          </div>
        </div>
      )}
      <div className="board__files" aria-hidden="true">
        {files.map((file) => (
          <span key={file}>{file}</span>
        ))}
      </div>
    </div>
  )
}

/** Place the lifted piece where it is held, or over its landing square. */
function liftedStyle(drag: DragState, orientation: Color) {
  if (drag.phase === 'dragging') {
    return {
      transform: `translate(${drag.x - drag.cellW / 2}px, ${drag.y - drag.cellH / 2}px)`,
    }
  }
  const { row, col } = displayCell(drag.landing, orientation)
  return {
    transform: `translate(${col * drag.cellW}px, ${row * drag.cellH}px)`,
  }
}
