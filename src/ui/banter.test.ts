import { describe, expect, it } from 'vitest'
import { fromBitPosition } from '../engine/adapter.ts'
import { parsePos } from '../engine/position.ts'
import { MATE_BOUND } from '../engine/score.ts'
import { squareFromName } from '../game/board.ts'
import { gameReducer, initialState, outcome } from '../state/gameReducer.ts'
import type { GameSetup, GameState } from '../state/gameReducer.ts'
import { createHistory } from '../state/history.ts'
import { banterOf } from './banter.ts'
import type { Banter } from './banter.ts'

const sq = squareFromName

const vsHare: GameSetup = {
  variant: 'checkers',
  opponentId: 'hare',
  humanColor: 'white',
}
const friends: GameSetup = {
  variant: 'checkers',
  opponentId: 'friend',
  humanColor: 'both',
}

/** A game standing at `literal`, with the setup it is being played under. */
function at(literal: string, setup: GameSetup = vsHare): GameState {
  return {
    ...initialState(setup),
    history: createHistory(fromBitPosition(parsePos(literal))),
  }
}

function move(state: GameState, from: string, to: string): GameState {
  return gameReducer(state, { type: 'move', from: sq(from), to: sq(to) })
}

/**
 * The position after `from`-`to`, read as a game against a persona. The
 * move is entered hot-seat, since the reducer will not play the persona's
 * side by hand.
 */
function played(
  literal: string,
  from: string,
  to: string,
  setup: GameSetup = vsHare,
): GameState {
  return { ...move(at(literal, friends), from, to), setup }
}

/** `banterOf` is given the status the screen has already worked out. */
function say(state: GameState): Banter | null {
  return banterOf(state, outcome(state))
}

describe('banterOf', () => {
  it('has nothing to say about an ordinary move', () => {
    expect(say(move(initialState(vsHare), 'c3', 'd4'))).toBe(null)
  })

  it('reads the result out once the game is over', () => {
    const decided = move(at('W:Wc3:Bd4'), 'c3', 'e5')
    expect(say(decided)).toEqual({ kind: 'result' })
  })

  it('puts an offer above any remark', () => {
    const offered = {
      ...at('W:WKa1:BKh8:14'),
      verdict: { ply: 0, score: 0 },
    }
    expect(say(offered)).toEqual({ kind: 'offer', offer: 'draw' })
    expect(
      say({
        ...offered,
        verdict: { ply: 0, score: MATE_BOUND },
      }),
    ).toEqual({ kind: 'offer', offer: 'resign' })
  })

  it('crows over its own haul and winces at the human one', () => {
    expect(say(played('B:Wd4,f6,h2:Bg7', 'g7', 'c3'))).toEqual({
      kind: 'remark',
      id: 'feast',
    })
    expect(say(played('W:Wb2:Bc3,e5,a7', 'b2', 'f6'))).toEqual({
      kind: 'remark',
      id: 'ouch',
    })
  })

  it('marks a king, whoever it belongs to', () => {
    expect(say(played('B:Wh2:Bb2', 'b2', 'a1'))).toEqual({
      kind: 'remark',
      id: 'crowned',
    })
    expect(say(played('W:Wa7:Bh2', 'a7', 'b8'))).toEqual({
      kind: 'remark',
      id: 'praise',
    })
  })

  it('turns the same events round at поддавки', () => {
    const giveaway: GameSetup = { ...vsHare, variant: 'giveaway' }
    // A pile of pieces taken is a punishment there, not a prize, and it is
    // the side that had to take them that is sorry about it.
    expect(say(played('B:Wd4,f6,h2:Bg7', 'g7', 'c3', giveaway))).toEqual({
      kind: 'remark',
      id: 'stuffed',
    })
    expect(say(played('W:Wb2:Bc3,e5,a7', 'b2', 'f6', giveaway))).toEqual({
      kind: 'remark',
      id: 'fed',
    })
    // A дамка is a piece nobody wants to be left holding.
    expect(say(played('B:Wh2:Bb2', 'b2', 'a1', giveaway))).toEqual({
      kind: 'remark',
      id: 'burdened',
    })
    expect(say(played('W:Wa7:Bh2', 'a7', 'b8', giveaway))).toEqual({
      kind: 'remark',
      id: 'unloaded',
    })
  })

  it('stays out of a game between two humans and out of a replay', () => {
    expect(say(played('B:Wd4,f6,h2:Bg7', 'g7', 'c3', friends))).toBe(null)
    const taken = played('B:Wd4,f6,h2:Bg7', 'g7', 'c3')
    expect(say(gameReducer(taken, { type: 'jumpTo', index: 0 }))).toBe(null)
  })
})
