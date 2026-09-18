import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { squareFromName } from '../game/board.ts'
import { gameReducer, initialState } from '../state/gameReducer.ts'
import type { GameState } from '../state/gameReducer.ts'
import { useClockTick } from './useClockTick.ts'

let clock = 0
const now = () => clock

function timed(id: '1+0' | '3+2' = '3+2'): GameState {
  return initialState(
    {
      variant: 'checkers',
      opponentId: 'friend',
      humanColor: 'both',
      timeControlId: id,
    },
    undefined,
    0,
  )
}

beforeEach(() => {
  clock = 0
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useClockTick', () => {
  it('does nothing in an untimed game', () => {
    const dispatch = vi.fn()
    const { result } = renderHook(() =>
      useClockTick(initialState(), dispatch, now),
    )
    const first = result.current
    act(() => {
      clock = 60_000
      vi.advanceTimersByTime(60_000)
    })
    expect(result.current).toBe(first)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('reports the current moment while the clock runs', () => {
    const { result } = renderHook(() => useClockTick(timed(), vi.fn(), now))
    act(() => {
      clock = 5_000
      vi.advanceTimersByTime(100)
    })
    expect(result.current).toBe(5_000)
  })

  it('calls the flag as soon as the bank is empty', () => {
    const dispatch = vi.fn()
    renderHook(() => useClockTick(timed('1+0'), dispatch, now))
    act(() => {
      clock = 59_900
      vi.advanceTimersByTime(100)
    })
    expect(dispatch).not.toHaveBeenCalled()
    act(() => {
      clock = 60_100
      vi.advanceTimersByTime(100)
    })
    expect(dispatch).toHaveBeenCalledWith({
      type: 'flag',
      color: 'white',
      at: 60_100,
    })
  })

  it('stays quiet while an earlier position is reviewed', () => {
    const dispatch = vi.fn()
    let state = gameReducer(timed('1+0'), {
      type: 'move',
      from: squareFromName('c3'),
      to: squareFromName('d4'),
      at: 1_000,
    })
    state = gameReducer(state, { type: 'jumpTo', index: 0, at: 2_000 })
    renderHook(() => useClockTick(state, dispatch, now))
    act(() => {
      clock = 600_000
      vi.advanceTimersByTime(600_000)
    })
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('notices a flag that fell while the tab was away', () => {
    const dispatch = vi.fn()
    renderHook(() => useClockTick(timed('1+0'), dispatch, now))
    // The tab was hidden: no interval ran, and the bank emptied meanwhile.
    clock = 120_000
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(dispatch).toHaveBeenCalledWith({
      type: 'flag',
      color: 'white',
      at: 120_000,
    })
  })

  it('stops reading once the game has ended on time', () => {
    const dispatch = vi.fn()
    const flagged = gameReducer(timed('1+0'), {
      type: 'flag',
      color: 'white',
      at: 60_000,
    })
    const { result } = renderHook(() => useClockTick(flagged, dispatch, now))
    const first = result.current
    act(() => {
      clock = 90_000
      vi.advanceTimersByTime(30_000)
    })
    expect(dispatch).not.toHaveBeenCalled()
    expect(result.current).toBe(first)
  })
})
