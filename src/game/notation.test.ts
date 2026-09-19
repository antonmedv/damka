import { describe, expect, it } from 'vitest'
import { squareFromName } from './board.ts'
import { formatMove, movePairs } from './notation.ts'
import type { Move } from './types.ts'

const quiet = (from: string, to: string): Move => ({
  from: squareFromName(from),
  to: squareFromName(to),
  captures: [],
  promotes: false,
  path: [squareFromName(to)],
})

describe('formatMove', () => {
  it('writes a quiet move with a dash', () => {
    expect(formatMove(quiet('c3', 'd4'))).toBe('c3-d4')
  })

  it('writes a capture with a colon', () => {
    const capture: Move = {
      ...quiet('c3', 'e5'),
      captures: [squareFromName('d4')],
    }
    expect(formatMove(capture)).toBe('c3:e5')
  })

  it('writes every landing square of a multiple capture', () => {
    const path = ['e5', 'g7'].map(squareFromName)
    const capture: Move = {
      from: squareFromName('c3'),
      to: squareFromName('g7'),
      captures: ['d4', 'f6'].map(squareFromName),
      promotes: false,
      path,
    }
    expect(formatMove(capture)).toBe('c3:e5:g7')
  })

  it('writes every landing square of an уголки chain with dashes', () => {
    const chain: Move = {
      from: squareFromName('a1'),
      to: squareFromName('c5'),
      captures: [],
      promotes: false,
      path: ['a3', 'a5', 'c5'].map(squareFromName),
    }
    expect(formatMove(chain)).toBe('a1-a3-a5-c5')
  })
})

describe('movePairs', () => {
  it('groups moves into numbered white/black pairs', () => {
    const pairs = movePairs([
      quiet('c3', 'd4'),
      quiet('f6', 'e5'),
      quiet('e3', 'f4'),
    ])
    expect(pairs).toEqual([
      { n: 1, white: quiet('c3', 'd4'), black: quiet('f6', 'e5') },
      { n: 2, white: quiet('e3', 'f4'), black: undefined },
    ])
  })

  it('returns no pairs for no moves', () => {
    expect(movePairs([])).toEqual([])
  })
})
