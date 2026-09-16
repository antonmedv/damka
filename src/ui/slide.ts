import { useLayoutEffect } from 'react'
import type { RefObject } from 'react'
import { displayCell } from '../game/board.ts'
import type { Color } from '../game/types.ts'
import { flightTo } from '../state/flight.ts'
import type { Flight } from '../state/flight.ts'
import { prefersReducedMotion } from './motion.ts'

/** Offset of a waypoint from the flight's destination, in display cells. */
export type Offset = { dx: number; dy: number }

/** A quiet move covers one cell; longer paths take proportionally longer. */
const BASE_MS = 120
const PER_CELL_MS = 60
/** Even a board-crossing sweep has to be over before the reply arrives. */
export const MAX_MS = 520

/**
 * Waypoints of `flight` as offsets from its destination: the origin first,
 * then every square the piece lands on, ending at `{dx: 0, dy: 0}`. The
 * piece travels from offset to offset, so a multiple capture bends around
 * each landing square instead of cutting straight across the board.
 */
export function slidePath(flight: Flight, orientation: Color): Offset[] {
  const to = displayCell(flightTo(flight), orientation)
  return [flight.from, ...flight.path].map((square) => {
    const cell = displayCell(square, orientation)
    return { dx: cell.col - to.col, dy: cell.row - to.row }
  })
}

/** Cells covered between two waypoints; every step of a move is diagonal. */
function span(a: Offset, b: Offset): number {
  return Math.max(Math.abs(a.dx - b.dx), Math.abs(a.dy - b.dy))
}

/** Cells covered by the whole path. */
export function slideCells(path: ReadonlyArray<Offset>): number {
  let cells = 0
  for (let i = 1; i < path.length; i++) cells += span(path[i - 1]!, path[i]!)
  return cells
}

export function slideDuration(path: ReadonlyArray<Offset>): number {
  return Math.min(MAX_MS, BASE_MS + PER_CELL_MS * slideCells(path))
}

/**
 * One keyframe per waypoint, placed in time by distance so the piece holds
 * a steady speed along the path: it leaves the origin gently, cruises
 * through the captures and settles onto the final square.
 */
export function slideKeyframes(path: ReadonlyArray<Offset>): Keyframe[] {
  const total = slideCells(path)
  let covered = 0
  return path.map((point, i) => {
    if (i > 0) covered += span(path[i - 1]!, point)
    return {
      offset: covered / total,
      transform: `translate(${point.dx * 100}%, ${point.dy * 100}%)`,
      easing: segmentEasing(i, path.length),
    }
  })
}

/** Easing of the leg starting at waypoint `i`; the last waypoint has none. */
function segmentEasing(i: number, waypoints: number): string {
  if (waypoints === 2) return 'ease-out'
  if (i === 0) return 'ease-in'
  return i === waypoints - 2 ? 'ease-out' : 'linear'
}

/**
 * Flies the piece that has just arrived at the end of `flight` in from
 * where it took off, along the flight's path. The board renders the new
 * position in one pass, so the animation is attached to the piece already
 * sitting on its destination — before the paint that would otherwise show
 * it there.
 */
export function useSlide(
  gridRef: RefObject<HTMLElement | null>,
  flight: Flight | null,
  orientation: Color,
): void {
  useLayoutEffect(() => {
    if (flight === null || flight.path.length === 0) return
    if (prefersReducedMotion()) return
    const piece = gridRef.current?.querySelector<HTMLElement>(
      `[data-square="${flightTo(flight)}"] .board__piece`,
    )
    if (piece === null || piece === undefined) return
    if (typeof piece.animate !== 'function') return
    const path = slidePath(flight, orientation)
    if (slideCells(path) === 0) return
    const animation = piece.animate(slideKeyframes(path), {
      duration: slideDuration(path),
      easing: 'linear',
    })
    return () => animation.cancel()
  }, [gridRef, flight, orientation])
}
