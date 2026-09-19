import { describe, expect, it } from 'vitest'
import { parseCorners } from '../corners/position.ts'
import { squareFromName } from '../game/board.ts'
import type { GameStatus } from '../game/types.ts'
import { NOTICE_MOVES, deadlineOf } from './deadline.ts'
import { gameReducer, initialState, outcome } from './gameReducer.ts'
import type { GameSetup, GameState } from './gameReducer.ts'

const sq = squareFromName

const vsHare: GameSetup = {
  variant: 'corners',
  opponentId: 'hare',
  humanColor: 'white',
}
const friends: GameSetup = {
  variant: 'corners',
  opponentId: 'friend',
  humanColor: 'both',
}

function at(literal: string, setup: GameSetup = vsHare): GameState {
  return initialState(setup, parseCorners(literal), 0)
}

/** `deadlineOf` is given the outcome the screen has already worked out. */
function read(state: GameState, status: GameStatus = outcome(state)) {
  return deadlineOf(state, status)
}

describe('deadlineOf', () => {
  it('says nothing while the deadline is further off than the notice', () => {
    // White to move with eleven moves left.
    expect(read(at('W:Wa1,d4:Bd5:58'))).toBe(null)
  })

  it('counts the player down from the notice to the last move', () => {
    expect(read(at('W:Wa1,b2,d4:Bd5:60'))).toEqual({
      squares: [sq('a1'), sq('b2')],
      moves: NOTICE_MOVES,
    })
    expect(read(at('W:Wa1,d4:Bd5:78'))).toEqual({
      squares: [sq('a1')],
      moves: 1,
    })
    // The last move is played and the man is still there: nothing left.
    expect(read(at('B:Wa1,d4:Bd5:79'))).toEqual({
      squares: [sq('a1')],
      moves: 0,
    })
  })

  it('keeps the player own men in view while the persona is to move', () => {
    expect(read(at('B:Wa1,d4:Bd5:61'))).toEqual({
      squares: [sq('a1')],
      moves: 9,
    })
  })

  it('says nothing about the persona men', () => {
    expect(read(at('W:Wd4:Bh8,d5:70'))).toBe(null)
  })

  it('tells whoever is to move in a game for two', () => {
    expect(read(at('W:Wa1,d4:Bh8,d5:70', friends))).toEqual({
      squares: [sq('a1')],
      moves: 5,
    })
    expect(read(at('B:Wa1,d4:Bh8,d5:71', friends))).toEqual({
      squares: [sq('h8')],
      moves: 5,
    })
  })

  it('points out the men the rule caught once the game is over', () => {
    expect(read(at('W:Wa1,d4:Bh8,d5:80'))).toEqual({
      squares: [sq('a1'), sq('h8')],
      moves: 0,
    })
    expect(read(at('W:Wd4:Bd5:80'))).toBe(null)
  })

  it('rings nothing when the game ended some other way', () => {
    // Resigned, or lost on the clock, with a man still at home.
    expect(read(at('W:Wa1,d4:Bd5:70'), 'blackWins')).toBe(null)
    expect(read(at('W:Wa1,d4:Bd5:70'), 'draw')).toBe(null)
    // A short-handed literal finishes with the loser's man at home; that
    // is a finish, not the home rule.
    expect(read(at('W:Wf6:Bh8:80'))).toBe(null)
  })

  it('says nothing about an earlier position or another game', () => {
    const moved = gameReducer(at('W:Wa1,d4:Bd5:70'), {
      type: 'move',
      from: sq('d4'),
      to: sq('e4'),
    })
    expect(read(moved)).toEqual({ squares: [sq('a1')], moves: 4 })
    expect(read(gameReducer(moved, { type: 'jumpTo', index: 0 }))).toBe(null)
    expect(read(initialState({ ...vsHare, variant: 'checkers' }))).toBe(null)
  })
})
