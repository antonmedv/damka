import { describe, expect, it } from 'vitest'
import { parseCorners } from '../corners/position.ts'
import { fromBitPosition } from '../engine/adapter.ts'
import { parsePos } from '../engine/position.ts'
import { squareFromName } from '../game/board.ts'
import type { TimeControlId } from '../game/timeControl.ts'
import { gameReducer, initialState } from './gameReducer.ts'
import type { GameState } from './gameReducer.ts'
import { gameStats, materialOf } from './stats.ts'

const sq = squareFromName

/** A two-human game starting from the literal, on a clock when asked. */
function stateAt(literal: string, timeControlId?: TimeControlId): GameState {
  return initialState(
    {
      variant: 'checkers',
      opponentId: 'friend',
      humanColor: 'both',
      timeControlId,
    },
    fromBitPosition(parsePos(literal)),
    0,
  )
}

function play(
  state: GameState,
  ...moves: [from: string, to: string, at?: number][]
): GameState {
  return moves.reduce(
    (s, [from, to, at]) =>
      gameReducer(s, { type: 'move', from: sq(from), to: sq(to), at }),
    state,
  )
}

describe('materialOf', () => {
  it('counts men and kings, a king worth three men', () => {
    const position = fromBitPosition(parsePos('W:Wc3,Ke1:Bd6'))
    expect(materialOf(position, 'white')).toEqual({
      men: 1,
      kings: 1,
      value: 4,
    })
    expect(materialOf(position, 'black')).toEqual({
      men: 1,
      kings: 0,
      value: 1,
    })
  })
})

describe('gameStats', () => {
  it('opens level, with a point per position', () => {
    const stats = gameStats(initialState())
    expect(stats.points).toHaveLength(1)
    expect(stats.points[0]).toMatchObject({ ply: 0, advantage: 0 })
    expect(stats.white).toMatchObject({ moves: 0, taken: 0 })
    expect(stats.timed).toBe(false)
  })

  it('follows the material through the game', () => {
    // c3 takes both men on the way to g7, so a man down becomes a man up.
    const state = play(stateAt('W:Wc3:Bd4,f6'), ['c3', 'e5'])
    expect(gameStats(state).points.map((p) => p.advantage)).toEqual([-1, 1])
  })

  it('shows a lead to Black as a negative advantage', () => {
    const state = play(stateAt('B:Wc3:Bd4'), ['d4', 'b2'])
    expect(gameStats(state).points.map((p) => p.advantage)).toEqual([0, -1])
  })

  it('counts captures, pieces taken and the biggest capture', () => {
    const state = play(stateAt('W:Wc3:Bd4,d6'), ['c3', 'c7'])
    expect(gameStats(state).white).toMatchObject({
      moves: 1,
      taken: 2,
      best: 2,
    })
    expect(gameStats(state).black).toMatchObject({
      moves: 0,
      taken: 0,
      best: 0,
    })
  })

  it('counts the men that reached the back rank', () => {
    const state = play(stateAt('W:Wc7:Bh2'), ['c7', 'b8'])
    expect(gameStats(state).white.crowned).toBe(1)
    expect(gameStats(state).points[1]!.white).toMatchObject({
      men: 0,
      kings: 1,
    })
  })

  it('credits each move to the side that played it', () => {
    const state = play(stateAt('B:Wc3:Bd6'), ['d6', 'c5'], ['c3', 'b4'])
    expect(gameStats(state).black.moves).toBe(1)
    expect(gameStats(state).white.moves).toBe(1)
  })

  it('keeps the whole timeline while an earlier position is reviewed', () => {
    const played = play(stateAt('W:Wc3:Bd4,f6'), ['c3', 'e5'])
    const reviewed = gameReducer(played, { type: 'jumpTo', index: 0 })
    expect(gameStats(reviewed).points).toHaveLength(2)
    expect(gameStats(reviewed).white.taken).toBe(2)
  })

  it('measures the time each side spent, increment included', () => {
    const state = play(
      stateAt('W:Wc3:Bd6', '3+2'),
      ['c3', 'b4', 5000],
      ['d6', 'c5', 9000],
    )
    expect(gameStats(state).white).toMatchObject({
      spentMs: 5000,
      longestMs: 5000,
    })
    expect(gameStats(state).black.spentMs).toBe(4000)
    expect(gameStats(state).timed).toBe(true)
  })

  it('charges the loser for the turn the flag fell on', () => {
    const timed = stateAt('W:Wc3:Bd6', '5+0')
    const flagged = gameReducer(timed, {
      type: 'flag',
      color: 'white',
      at: 301_000,
    })
    // The whole bank went on the turn nobody finished.
    expect(gameStats(flagged).white).toMatchObject({
      spentMs: 300_000,
      longestMs: 300_000,
    })
    expect(gameStats(flagged).black.spentMs).toBe(0)
  })

  it('measures nothing in an untimed game', () => {
    const state = play(stateAt('W:Wc3:Bd6'), ['c3', 'b4', 5000])
    expect(gameStats(state).white).toMatchObject({
      spentMs: 0,
      longestMs: 0,
    })
  })
})

describe('gameStats: уголки', () => {
  /** A two-human race starting from the literal. */
  function raceAt(literal: string): GameState {
    return initialState(
      { variant: 'corners', opponentId: 'friend', humanColor: 'both' },
      parseCorners(literal),
      0,
    )
  }

  it('measures the race in squares left', () => {
    const state = play(raceAt('W:Wa1:Bh8'), ['a1', 'b1'])
    expect(gameStats(state).points.map((p) => p.left)).toEqual([
      { white: 10, black: 10 },
      { white: 9, black: 10 },
    ])
    expect(gameStats(state).points.map((p) => p.advantage)).toEqual([0, 1])
  })

  it('counts jumps and the longest chain, and a step as neither', () => {
    const state = play(raceAt('W:Wa1:Ba2,a4,b5'), ['a1', 'c5'], ['b5', 'b4'])
    expect(gameStats(state).white).toMatchObject({
      moves: 1,
      leaps: 1,
      longestLeap: 3,
      taken: 0,
    })
    expect(gameStats(state).black).toMatchObject({
      moves: 1,
      leaps: 0,
      longestLeap: 0,
    })
  })

  it('counts a single jump as a chain of one', () => {
    const state = play(raceAt('W:Wa1:Ba2,h8'), ['a1', 'a3'])
    expect(gameStats(state).white).toMatchObject({ leaps: 1, longestLeap: 1 })
  })
})
