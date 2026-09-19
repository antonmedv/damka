import { describe, expect, it } from 'vitest'
import { BLACK_WINS, DRAW, ONGOING, WHITE_WINS } from '../engine/status.ts'
import { generateDetailed } from './movegen.ts'
import { initialPosition } from './board.ts'
import { parseCorners } from './position.ts'
import {
  HOME_PLIES,
  LIMIT_PLIES,
  endingOf,
  movesBeforeDeadline,
  status,
} from './status.ts'

const WHITE_DONE = 'Wf6,g6,h6,f7,g7,h7,f8,g8,h8'
const BLACK_DONE = 'Ba1,b1,c1,a2,b2,c2,a3,b3,c3'
const WHITE_HOME_ALL = 'Wa1,b1,c1,a2,b2,c2,a3,b3,c3'
const BLACK_HOME_ALL = 'Bf6,g6,h6,f7,g7,h7,f8,g8,h8'

/** `status` with the move count the position really has. */
function at(literal: string): number {
  const position = parseCorners(literal)
  return status(position, generateDetailed(position).length)
}

describe('status: the race', () => {
  it('is ongoing at the start', () => {
    const start = initialPosition()
    expect(status(start, generateDetailed(start).length)).toBe(ONGOING)
  })

  it('gives White the win once Black has had its answer', () => {
    // White filled the target and Black moved without filling its own.
    expect(at(`W:${WHITE_DONE}:Bd4,d5,d6,e4,e5,e6,a1,b1,c1`)).toBe(WHITE_WINS)
  })

  it('lets Black answer a White finish', () => {
    // Black to move: the game goes on for one more move.
    expect(at(`B:${WHITE_DONE}:Bd4,d5,d6,e4,e5,e6,a1,b1,c2`)).toBe(ONGOING)
  })

  it('is a draw when Black finishes with the answer', () => {
    expect(at(`W:${WHITE_DONE}:${BLACK_DONE}`)).toBe(DRAW)
    expect(at(`B:${WHITE_DONE}:${BLACK_DONE}`)).toBe(DRAW)
  })

  it('gives Black the win at once: White has already moved', () => {
    expect(at(`W:Wd4,d5,d6,e4,e5,e6,f8,g8,h8:${BLACK_DONE}`)).toBe(BLACK_WINS)
  })

  it('needs every man in, not most of them', () => {
    expect(at('W:Wf6,g6,h6,f7,g7,h7,f8,g8,e5:Bd4')).toBe(ONGOING)
  })
})

describe('status: blocking', () => {
  it('loses the side with a man still at home from HOME_PLIES on', () => {
    const late = `:${HOME_PLIES}`
    expect(at(`W:Wa1,d4:Bd5${late}`)).toBe(BLACK_WINS)
    expect(at(`B:Wa1,d4:Bd5${late}`)).toBe(BLACK_WINS)
    expect(at(`W:Wd4:Bh8,d5${late}`)).toBe(WHITE_WINS)
    // A man back in its own home after the deadline is the same loss.
    expect(at(`W:Wd4:Bg7${late}`)).toBe(WHITE_WINS)
  })

  it('draws when both sides still have a man at home', () => {
    expect(at(`W:Wa1,d4:Bh8,d5:${HOME_PLIES}`)).toBe(DRAW)
  })

  it('does not read the home rule a ply early', () => {
    expect(at(`W:Wa1,d4:Bd5:${HOME_PLIES - 1}`)).toBe(ONGOING)
  })

  it('lets a finished race win before the home rule is read', () => {
    // White is home and Black still has a man in its own home.
    expect(
      at(`W:${WHITE_DONE}:Bd4,d5,d6,e4,e5,e6,a1,b1,c1:${HOME_PLIES}`),
    ).toBe(WHITE_WINS)
  })

  it('decides by the count in the targets at LIMIT_PLIES', () => {
    const end = `:${LIMIT_PLIES}`
    expect(at(`W:Wf6,g6,d4:Bc3,d5,d6${end}`)).toBe(WHITE_WINS)
    expect(at(`W:Wf6,d4,d3:Bc3,b2,d6${end}`)).toBe(BLACK_WINS)
    expect(at(`W:Wf6,d4:Bc3,d5${end}`)).toBe(DRAW)
    expect(at(`W:Wf6,g6,d4:Bc3,d5,d6:${LIMIT_PLIES - 1}`)).toBe(ONGOING)
  })

  it('loses the side with no legal move', () => {
    // b7's four neighbours are all taken, with nothing empty beyond.
    expect(at('W:Wb7:Bb8,a7,c7,b6,d7,b5')).toBe(BLACK_WINS)
    // The move count is the caller's to supply.
    const stuck = parseCorners('W:Wb7:Bb8,a7,c7,b6,d7,b5')
    expect(status(stuck, 1)).toBe(ONGOING)
  })
})

describe('endingOf', () => {
  const ending = (literal: string) => {
    const position = parseCorners(literal)
    return endingOf(position, generateDetailed(position).length)
  }

  it('names why a game ended', () => {
    expect(ending(`W:${WHITE_DONE}:Bd4,d5,d6,e4,e5,e6,a1,b1,c1`)).toBe('finish')
    expect(ending(`W:${WHITE_DONE}:${BLACK_DONE}`)).toBe('finish')
    expect(ending(`W:Wa1,d4:Bd5:${HOME_PLIES}`)).toBe('blocked')
    expect(ending(`W:Wf6,g6,d4:Bc3,d5,d6:${LIMIT_PLIES}`)).toBe('limit')
    expect(ending(`W:Wf6,d4:Bc3,d5:${LIMIT_PLIES}`)).toBe('limit')
    expect(ending('W:Wb7:Bb8,a7,c7,b6,d7,b5')).toBe('noMoves')
  })

  it('does not call a side with no men finished', () => {
    // A hand-made literal: White has nothing, so White has no move.
    expect(at('W:W:Bh8')).toBe(BLACK_WINS)
    expect(ending('W:W:Bh8')).toBe('noMoves')
  })

  it('has nothing to say about a game still going', () => {
    expect(ending(`W:${WHITE_HOME_ALL}:${BLACK_HOME_ALL}`)).toBe('none')
  })
})

describe('movesBeforeDeadline', () => {
  const left = (literal: string, color: 'white' | 'black'): number =>
    movesBeforeDeadline(parseCorners(literal), color)

  it('counts the moves a side has before the home rule is read', () => {
    // From the start each side has forty; White moves at even plies.
    expect(left('W:Wa1:Bh8', 'white')).toBe(HOME_PLIES / 2)
    expect(left('W:Wa1:Bh8', 'black')).toBe(HOME_PLIES / 2)
    expect(left(`W:Wa1:Bh8:${HOME_PLIES - 10}`, 'white')).toBe(5)
    expect(left(`W:Wa1:Bh8:${HOME_PLIES - 10}`, 'black')).toBe(5)
    expect(left(`B:Wa1:Bh8:${HOME_PLIES - 9}`, 'white')).toBe(4)
    expect(left(`B:Wa1:Bh8:${HOME_PLIES - 9}`, 'black')).toBe(5)
  })

  it('reaches one on the last move and none once it is played', () => {
    expect(left(`W:Wa1:Bh8:${HOME_PLIES - 2}`, 'white')).toBe(1)
    expect(left(`B:Wa1:Bh8:${HOME_PLIES - 1}`, 'white')).toBe(0)
    expect(left(`B:Wa1:Bh8:${HOME_PLIES - 1}`, 'black')).toBe(1)
    expect(left(`W:Wa1:Bh8:${HOME_PLIES}`, 'white')).toBe(0)
    expect(left(`W:Wa1:Bh8:${HOME_PLIES + 7}`, 'black')).toBe(0)
  })
})
