import { useEffect, useRef } from 'react'
import { formatMove, movePairs } from '../game/notation.ts'
import type { Move } from '../game/types.ts'
import { t } from '../i18n/index.ts'
import './MoveList.css'

type MoveListProps = {
  moves: ReadonlyArray<Move>
  /** Index of the move that produced the displayed position; -1 at the start. */
  current: number
  onSelect: (index: number) => void
}

export function MoveList({ moves, current, onSelect }: MoveListProps) {
  const listRef = useRef<HTMLOListElement>(null)
  const currentRef = useRef<HTMLButtonElement>(null)

  // Scroll the list itself: scrollIntoView would also scroll the page,
  // yanking the board out of view on phones after every move.
  useEffect(() => {
    const list = listRef.current
    const el = currentRef.current
    if (list === null || el === null) return
    const top = el.offsetTop
    const bottom = top + el.offsetHeight
    if (top < list.scrollTop) list.scrollTop = top
    else if (bottom > list.scrollTop + list.clientHeight) {
      list.scrollTop = bottom - list.clientHeight
    }
  }, [current, moves.length])

  if (moves.length === 0) {
    return <p className="move-list move-list--empty">{t.moveList.empty}</p>
  }

  const item = (move: Move, index: number) => (
    <button
      type="button"
      className={
        index === current
          ? 'move-list__move move-list__move--current'
          : 'move-list__move'
      }
      aria-current={index === current ? 'step' : undefined}
      ref={index === current ? currentRef : undefined}
      onClick={() => onSelect(index)}
    >
      {formatMove(move)}
    </button>
  )

  return (
    <ol className="move-list" aria-label={t.moveList.title} ref={listRef}>
      {movePairs(moves).map((pair) => (
        <li key={pair.n} className="move-list__pair">
          <span className="move-list__n">{pair.n}.</span>
          {item(pair.white, (pair.n - 1) * 2)}
          {pair.black && item(pair.black, (pair.n - 1) * 2 + 1)}
        </li>
      ))}
    </ol>
  )
}
