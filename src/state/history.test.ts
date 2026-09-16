import { describe, expect, it } from 'vitest'
import {
  canRedo,
  canUndo,
  createHistory,
  jumpTo,
  push,
  redo,
  undo,
} from './history.ts'

describe('history', () => {
  it('starts with no past and no future', () => {
    const h = createHistory('a')
    expect(h).toEqual({ past: [], present: 'a', future: [] })
    expect(canUndo(h)).toBe(false)
    expect(canRedo(h)).toBe(false)
  })

  it('push moves present into the past and clears the future', () => {
    const h = undo(push(push(createHistory('a'), 'b'), 'c'))
    const next = push(h, 'x')
    expect(next).toEqual({ past: ['a', 'b'], present: 'x', future: [] })
  })

  it('undo and redo step through the timeline', () => {
    const h = push(push(createHistory('a'), 'b'), 'c')
    const back = undo(h)
    expect(back).toEqual({ past: ['a'], present: 'b', future: ['c'] })
    expect(redo(back)).toEqual(h)
  })

  it('undo at the start and redo at the end return the same history', () => {
    const h = createHistory('a')
    expect(undo(h)).toBe(h)
    expect(redo(h)).toBe(h)
  })

  it('jumpTo selects any point on the timeline', () => {
    const h = push(push(push(createHistory('a'), 'b'), 'c'), 'd')
    expect(jumpTo(h, 0)).toEqual({
      past: [],
      present: 'a',
      future: ['b', 'c', 'd'],
    })
    expect(jumpTo(h, 2)).toEqual({
      past: ['a', 'b'],
      present: 'c',
      future: ['d'],
    })
    expect(jumpTo(h, 3)).toEqual(h)
  })

  it('jumpTo clamps out-of-range indexes', () => {
    const h = push(createHistory('a'), 'b')
    expect(jumpTo(h, -5).present).toBe('a')
    expect(jumpTo(h, 99).present).toBe('b')
  })
})
