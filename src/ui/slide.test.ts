import { describe, expect, it } from 'vitest'
import { squareFromName } from '../game/board.ts'
import type { Move } from '../game/types.ts'
import {
  slideCells,
  slideDuration,
  slideKeyframes,
  slidePath,
} from './slide.ts'

function move(from: string, path: string[], captures: string[] = []): Move {
  const squares = path.map(squareFromName)
  return {
    from: squareFromName(from),
    to: squares[squares.length - 1]!,
    captures: captures.map(squareFromName),
    promotes: false,
    path: squares,
  }
}

describe('slidePath', () => {
  it('runs from the origin to the destination for a quiet move', () => {
    expect(slidePath(move('c3', ['d4']), 'white')).toEqual([
      { dx: -1, dy: 1 },
      { dx: 0, dy: 0 },
    ])
  })

  it('bends through every landing square of a multiple capture', () => {
    // c3 takes on d4 to e5, then on d6 to c7: two legs, not one diagonal.
    expect(slidePath(move('c3', ['e5', 'c7'], ['d4', 'd6']), 'white')).toEqual([
      { dx: 0, dy: 4 },
      { dx: 2, dy: 2 },
      { dx: 0, dy: 0 },
    ])
  })

  it('mirrors the offsets when the board is flipped', () => {
    expect(slidePath(move('c3', ['e5', 'c7'], ['d4', 'd6']), 'black')).toEqual([
      { dx: 0, dy: -4 },
      { dx: -2, dy: -2 },
      { dx: 0, dy: 0 },
    ])
  })
})

describe('slideCells', () => {
  it('sums the legs rather than measuring origin to destination', () => {
    // c3 to c7 is 4 cells apart, but the piece travels 2 + 2 via e5.
    const path = slidePath(move('c3', ['e5', 'c7'], ['d4', 'd6']), 'white')
    expect(slideCells(path)).toBe(4)
    expect(slideCells(slidePath(move('c3', ['d4']), 'white'))).toBe(1)
  })
})

describe('slideDuration', () => {
  it('grows with the distance travelled', () => {
    const quiet = slideDuration(slidePath(move('c3', ['d4']), 'white'))
    const chain = slideDuration(
      slidePath(move('c3', ['e5', 'c7'], ['d4', 'd6']), 'white'),
    )
    expect(quiet).toBe(180)
    expect(chain).toBeGreaterThan(quiet)
  })

  it('caps a board-crossing sweep', () => {
    const long = Array.from({ length: 20 }, (_, i) => ({ dx: i, dy: 0 }))
    expect(slideDuration(long)).toBe(520)
  })
})

describe('slideKeyframes', () => {
  it('translates by whole cells and ends in place', () => {
    const frames = slideKeyframes(slidePath(move('c3', ['d4']), 'white'))
    expect(frames).toEqual([
      { offset: 0, transform: 'translate(-100%, 100%)', easing: 'ease-out' },
      { offset: 1, transform: 'translate(0%, 0%)', easing: 'ease-out' },
    ])
  })

  it('spaces the waypoints by distance so the speed stays even', () => {
    // Legs of 2 and 4 cells: the turn falls a third of the way through.
    const path = slidePath(move('c3', ['e5', 'a1'], ['d4', 'd4']), 'white')
    expect(slideKeyframes(path).map((f) => f.offset)).toEqual([0, 1 / 3, 1])
  })

  it('eases out of the origin, cruises, then settles', () => {
    const path = slidePath(
      move('a1', ['c3', 'e5', 'g7'], ['b2', 'd4', 'f6']),
      'white',
    )
    // Each easing covers the leg that starts at its waypoint, so the one
    // on the final keyframe is never used.
    const legs = slideKeyframes(path).slice(0, -1)
    expect(legs.map((f) => f.easing)).toEqual(['ease-in', 'linear', 'ease-out'])
  })
})
