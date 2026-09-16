import { describe, expect, it } from 'vitest'
import { timeControlById } from '../game/timeControl.ts'
import {
  commitMove,
  createClock,
  flag,
  flaggedAt,
  hasFlagged,
  remaining,
  seek,
  settle,
  snapshot,
  stop,
} from './clock.ts'

const blitz = timeControlById('3+2')
const rapid = timeControlById('5+0')

describe('createClock', () => {
  it('gives both sides the bank and starts the first turn', () => {
    const clock = createClock(blitz, 'white', 1000)
    expect(clock.times).toEqual([{ white: 180_000, black: 180_000 }])
    expect(clock.startedAt).toBe(1000)
    expect(clock.flagged).toBe(null)
  })
})

describe('remaining', () => {
  it('charges only the side to move', () => {
    const clock = createClock(rapid, 'white', 0)
    expect(remaining(clock, 0, 'white', 4000)).toEqual({
      white: 296_000,
      black: 300_000,
    })
  })

  it('freezes both sides while the clock is stopped', () => {
    const clock = seek(createClock(rapid, 'white', 0), 0, false, 4000)
    expect(remaining(clock, 0, 'white', 60_000)).toEqual({
      white: 300_000,
      black: 300_000,
    })
  })

  it('never goes below zero, however long the tab was away', () => {
    const clock = createClock(rapid, 'white', 0)
    expect(remaining(clock, 0, 'white', 10 * 60_000).white).toBe(0)
  })

  it('shows zero for the side that flagged', () => {
    const clock = flag(createClock(rapid, 'white', 0), 'black', 0)
    expect(remaining(clock, 0, 'black', 0)).toEqual({
      white: 300_000,
      black: 0,
    })
  })

  it('shows the bank as it stood before the flag fell', () => {
    const played = commitMove(createClock(rapid, 'white', 0), 0, 'white', 5000)
    const flagged = flag(played, 'black', 1)
    expect(remaining(flagged, 0, 'white', 9000)).toEqual({
      white: 300_000,
      black: 300_000,
    })
    expect(remaining(flagged, 1, 'black', 9000).black).toBe(0)
  })
})

describe('hasFlagged', () => {
  it('is false with a millisecond left and true at zero', () => {
    const clock = createClock(rapid, 'white', 0)
    expect(hasFlagged(clock, 0, 'white', 299_999)).toBe(false)
    expect(hasFlagged(clock, 0, 'white', 300_000)).toBe(true)
    expect(hasFlagged(clock, 0, 'white', 400_000)).toBe(true)
  })

  it('is false while frozen, whoever is asked about', () => {
    const frozen = seek(createClock(rapid, 'white', 0), 0, false, 0)
    expect(hasFlagged(frozen, 0, 'white', 10 * 60_000)).toBe(false)
    const flagged = flag(frozen, 'white', 0)
    expect(hasFlagged(flagged, 0, 'white', 10 * 60_000)).toBe(false)
  })
})

describe('flaggedAt', () => {
  it('names nobody on a clock that is still running', () => {
    expect(flaggedAt(createClock(rapid, 'white', 0), 0)).toBe(null)
  })

  it('stands from the ply it fell on onwards, and not before it', () => {
    const played = commitMove(createClock(blitz, 'white', 0), 0, 'white', 5000)
    const flagged = flag(played, 'black', 1)
    expect(flaggedAt(flagged, 0)).toBe(null)
    expect(flaggedAt(flagged, 1)).toBe('black')
    expect(flaggedAt(flagged, 2)).toBe('black')
  })
})

describe('commitMove', () => {
  it('charges the mover, adds the increment and starts the next turn', () => {
    const clock = commitMove(createClock(blitz, 'white', 0), 0, 'white', 5000)
    expect(clock.times).toEqual([
      { white: 180_000, black: 180_000 },
      { white: 177_000, black: 180_000 },
    ])
    expect(clock.startedAt).toBe(5000)
  })

  it('adds no increment when the control has none', () => {
    const clock = commitMove(createClock(rapid, 'white', 0), 0, 'white', 5000)
    expect(snapshot(clock, 1)).toEqual({ white: 295_000, black: 300_000 })
  })

  it('gives the increment even to a move that used the whole bank', () => {
    const clock = commitMove(
      createClock(blitz, 'white', 0),
      0,
      'white',
      400_000,
    )
    expect(snapshot(clock, 1)).toEqual({ white: 2_000, black: 180_000 })
  })

  it('drops the snapshots of the line it replaces', () => {
    let clock = createClock(blitz, 'white', 0)
    clock = commitMove(clock, 0, 'white', 1000)
    clock = commitMove(clock, 1, 'black', 2000)
    expect(snapshot(clock, 2)).toEqual({ white: 181_000, black: 181_000 })
    // Back to ply 1 and a slower move: the old ply 2 is overwritten, not kept.
    const branched = commitMove(seek(clock, 1, true, 3000), 1, 'black', 8000)
    expect(branched.times).toHaveLength(3)
    expect(snapshot(branched, 1)).toEqual({ white: 181_000, black: 180_000 })
    expect(snapshot(branched, 2)).toEqual({ white: 181_000, black: 177_000 })
  })
})

describe('stop', () => {
  it('freezes a running clock and leaves a frozen one alone', () => {
    const running = createClock(blitz, 'white', 1_000)
    expect(stop(running).startedAt).toBe(null)
    const frozen = stop(running)
    expect(stop(frozen)).toBe(frozen)
  })

  it('keeps the banks exactly as they stood', () => {
    const clock = commitMove(createClock(blitz, 'white', 0), 0, 'white', 5_000)
    expect(snapshot(stop(clock), 1)).toEqual(snapshot(clock, 1))
  })
})

describe('seek', () => {
  it('restores the snapshot of the ply it lands on', () => {
    let clock = createClock(blitz, 'white', 0)
    clock = commitMove(clock, 0, 'white', 30_000)
    const back = seek(clock, 0, true, 100_000)
    expect(remaining(back, 0, 'white', 100_000)).toEqual({
      white: 180_000,
      black: 180_000,
    })
  })

  it('freezes when the position is not the live one', () => {
    const clock = seek(
      commitMove(createClock(blitz, 'white', 0), 0, 'white', 5),
      0,
      false,
      9,
    )
    expect(clock.startedAt).toBe(null)
  })

  it('stays frozen on the ply the game was lost on', () => {
    const flagged = flag(createClock(blitz, 'white', 0), 'white', 0)
    const looked = seek(flagged, 0, true, 10)
    expect(looked.flagged).toEqual({ color: 'white', ply: 0 })
    expect(looked.startedAt).toBe(null)
  })

  it('carries on at a ply the game had not been lost on yet', () => {
    const played = commitMove(createClock(blitz, 'white', 0), 0, 'white', 5000)
    const back = seek(flag(played, 'black', 1), 0, true, 10)
    expect(back.startedAt).toBe(10)
  })

  it('throws for a ply that is not on the timeline', () => {
    expect(() => seek(createClock(blitz, 'white', 0), 3, true, 0)).toThrow(
      'no clock snapshot for ply 3',
    )
  })
})

describe('settle', () => {
  it('charges the unfinished turn and stops without an increment', () => {
    const clock = commitMove(createClock(blitz, 'white', 0), 0, 'white', 1_000)
    const settled = settle(clock, 1, 'black', 5_000)

    expect(settled.startedAt).toBe(null)
    // Four seconds off Black's bank; White keeps what the move left it.
    expect(settled.times).toHaveLength(2)
    expect(snapshot(settled, 1)).toEqual({
      white: 181_000,
      black: 176_000,
    })
    // Read at any later moment, the clock still says the same thing.
    expect(remaining(settled, 1, 'black', 900_000)).toEqual({
      white: 181_000,
      black: 176_000,
    })
  })

  it('only stops where the action carried no moment', () => {
    const clock = createClock(blitz, 'white', 0)
    const settled = settle(clock, 0, 'white', null)

    expect(settled.startedAt).toBe(null)
    expect(settled.times).toEqual(clock.times)
  })

  it('never charges a bank past empty', () => {
    const clock = createClock(blitz, 'white', 0)
    expect(snapshot(settle(clock, 0, 'white', 500_000), 0).white).toBe(0)
  })
})
