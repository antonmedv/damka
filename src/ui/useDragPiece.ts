import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { Rect } from '../game/board.ts'
import type { Piece, Square } from '../game/types.ts'
import { prefersReducedMotion } from './motion.ts'

export type DragPhase = 'dragging' | 'returning' | 'settling'

export type DragState = {
  readonly from: Square
  readonly piece: Piece
  readonly phase: DragPhase
  /** Centre of the lifted piece relative to the grid's top-left corner, in px. */
  readonly x: number
  readonly y: number
  /** Grid cell size in px when the pointer last moved. */
  readonly cellW: number
  readonly cellH: number
  /** Square under the lifted piece's centre (target or not), if any. */
  readonly over: Square | null
  /** Where the lifted piece ends up: `from` when returning, `to` when settling. */
  readonly landing: Square
}

export type Point = { x: number; y: number }

export type DragOptions = {
  canDrag: (square: Square) => boolean
  pieceAt: (square: Square) => Piece | undefined
  isTarget: (square: Square) => boolean
  /** Square under a viewport point, or null when off the board. */
  squareAtPoint: (x: number, y: number) => Square | null
  /** Viewport centre of a square, or null before layout. */
  squareCenter: (square: Square) => Point | null
  gridRect: () => Rect | null
  onTap: (square: Square) => void
  onDragStart: (square: Square) => void
  onDrop: (from: Square, to: Square) => void
  /**
   * Pointer travel (px) that turns a press into a drag. Defaults per pointer
   * type: a finger wobbles more than a mouse.
   */
  threshold?: number
  returnMs?: number
  settleMs?: number
}

const THRESHOLD_MOUSE = 4
const THRESHOLD_TOUCH = 8

type Armed = {
  square: Square
  piece: Piece | undefined
  pointerId: number
  x0: number
  y0: number
  /** Pointer minus piece centre at press: the piece is lifted without a jump. */
  grabDx: number
  grabDy: number
  threshold: number
  draggable: boolean
  dragging: boolean
}

/**
 * Pointer-event drag for board pieces. Press and release within the
 * threshold is a tap; further travel lifts the piece. The piece keeps the
 * offset it was grabbed at, and its centre — not the pointer — decides which
 * square it is over, so what the player sees is what gets dropped.
 * Listeners live on `window` while a press is active so a release anywhere
 * ends it.
 */
export function useDragPiece(options: DragOptions) {
  const [drag, setDrag] = useState<DragState | null>(null)
  // Handlers are attached once per press but must see the latest props.
  const optionsRef = useRef(options)
  useLayoutEffect(() => {
    optionsRef.current = options
  })
  const armed = useRef<Armed | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const detach = useRef<(() => void) | null>(null)

  useEffect(
    () => () => {
      detach.current?.()
      if (timer.current !== null) clearTimeout(timer.current)
    },
    [],
  )

  function finish(phase: 'returning' | 'settling', landing: Square) {
    const { returnMs = 150, settleMs = 120 } = optionsRef.current
    const ms = phase === 'returning' ? returnMs : settleMs
    if (ms === 0 || prefersReducedMotion()) {
      setDrag(null)
      return
    }
    setDrag((d) => (d === null ? null : { ...d, phase, landing, over: null }))
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      setDrag(null)
    }, ms)
  }

  function release() {
    detach.current?.()
    detach.current = null
    armed.current = null
  }

  /** Centre of the lifted piece for a pointer at (x, y). */
  function pieceCenter(a: Armed, x: number, y: number): Point {
    return { x: x - a.grabDx, y: y - a.grabDy }
  }

  function onPointerMove(e: PointerEvent) {
    const a = armed.current
    if (a === null || e.pointerId !== a.pointerId) return
    const opts = optionsRef.current
    if (!a.dragging) {
      if (!a.draggable || a.piece === undefined) return
      if (Math.hypot(e.clientX - a.x0, e.clientY - a.y0) < a.threshold) return
      a.dragging = true
      opts.onDragStart(a.square)
    }
    const rect = opts.gridRect()
    if (rect === null) return
    if (a.piece === undefined) return
    const c = pieceCenter(a, e.clientX, e.clientY)
    const over = opts.squareAtPoint(c.x, c.y)
    setDrag({
      from: a.square,
      piece: a.piece,
      phase: 'dragging',
      x: c.x - rect.left,
      y: c.y - rect.top,
      cellW: rect.width / 8,
      cellH: rect.height / 8,
      over: over === a.square ? null : over,
      landing: a.square,
    })
  }

  function onPointerUp(e: PointerEvent) {
    const a = armed.current
    if (a === null || e.pointerId !== a.pointerId) return
    release()
    const opts = optionsRef.current
    if (!a.dragging) {
      opts.onTap(a.square)
      return
    }
    const c = pieceCenter(a, e.clientX, e.clientY)
    const over = opts.squareAtPoint(c.x, c.y)
    if (over !== null && over !== a.square && opts.isTarget(over)) {
      opts.onDrop(a.square, over)
      finish('settling', over)
    } else {
      finish('returning', a.square)
    }
  }

  function cancel() {
    const a = armed.current
    if (a === null) return
    release()
    if (a.dragging) finish('returning', a.square)
  }

  function onPointerCancel(e: PointerEvent) {
    if (armed.current?.pointerId === e.pointerId) cancel()
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') cancel()
  }

  function onPointerDown(e: ReactPointerEvent<HTMLElement>) {
    if (e.button !== 0) return
    const stale = armed.current
    if (stale !== null) {
      // A second finger must not disturb a drag in progress; the same
      // pointer pressing again means its release got lost off-window.
      if (stale.dragging && stale.pointerId !== e.pointerId) return
      cancel()
    }
    const el = (e.target as Element).closest('[data-square]')
    if (el === null) return
    const square = Number(el.getAttribute('data-square'))
    const opts = optionsRef.current
    const piece = opts.pieceAt(square)
    const draggable = piece !== undefined && opts.canDrag(square)
    const center = opts.squareCenter(square)

    armed.current = {
      square,
      piece,
      pointerId: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      grabDx: center === null ? 0 : e.clientX - center.x,
      grabDy: center === null ? 0 : e.clientY - center.y,
      threshold:
        opts.threshold ??
        (e.pointerType === 'touch' ? THRESHOLD_TOUCH : THRESHOLD_MOUSE),
      draggable,
      dragging: false,
    }
    // Capture every press so the release reaches us even outside the grid.
    const grid = e.currentTarget
    grid.setPointerCapture?.(e.pointerId)

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)
    window.addEventListener('keydown', onKeyDown)
    // Losing the window or the capture mid-drag must not strand the piece.
    window.addEventListener('blur', cancel)
    grid.addEventListener('lostpointercapture', onPointerCancel)
    detach.current = () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerCancel)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('blur', cancel)
      grid.removeEventListener('lostpointercapture', onPointerCancel)
    }
  }

  return { drag, onPointerDown }
}
