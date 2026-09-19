import { describe, expect, it } from 'vitest'
import { parseCorners } from '../corners/position.ts'
import { parsePos } from '../engine/position.ts'
import { fromBitPosition } from '../engine/adapter.ts'
import { initialPosition, squareFromName } from './board.ts'
import { gameStatus, legalMoves, movablePieces, movesFrom } from './moves.ts'
import { formatMove } from './notation.ts'

const sq = squareFromName
const at = (literal: string) => fromBitPosition(parsePos(literal))

describe('legalMoves', () => {
  it('lists the seven opening moves for white', () => {
    const moves = legalMoves(initialPosition('checkers'), 'checkers')
      .map(formatMove)
      .sort()
    expect(moves).toEqual(
      ['a3-b4', 'c3-b4', 'c3-d4', 'e3-d4', 'e3-f4', 'g3-f4', 'g3-h4'].sort(),
    )
  })

  it('returns the same list for the same position object', () => {
    const position = initialPosition('checkers')
    expect(legalMoves(position, 'checkers')).toBe(
      legalMoves(position, 'checkers'),
    )
  })

  it('returns only captures when a capture exists, with the full path', () => {
    const moves = legalMoves(at('W:Wc3,a1:Bd4,d6'), 'checkers').map(formatMove)
    expect(moves).toEqual(['c3:e5:c7'])
  })

  it('keeps every path when several lead to the same square', () => {
    const moves = legalMoves(at('W:Wd2:Bc3,e3,c5,e5,g3'), 'checkers').map(
      formatMove,
    )
    expect(moves.sort()).toEqual(
      ['d2:b4:d6:f4:d2', 'd2:b4:d6:f4:h2', 'd2:f4:d6:b4:d2', 'd2:f4:h2'].sort(),
    )
  })
})

describe('movesFrom and movablePieces', () => {
  it('filters by origin', () => {
    const position = initialPosition('checkers')
    expect(
      movesFrom(position, sq('c3'), 'checkers')
        .map((m) => m.to)
        .sort(),
    ).toEqual([sq('b4'), sq('d4')].sort())
    expect(movesFrom(position, sq('a1'), 'checkers')).toEqual([])
    expect(movesFrom(position, sq('f6'), 'checkers')).toEqual([])
  })

  it('names only pieces that can move', () => {
    expect(
      movablePieces(initialPosition('checkers'), 'checkers')
        .map((s) => s)
        .sort(),
    ).toEqual([sq('a3'), sq('c3'), sq('e3'), sq('g3')].sort())
    expect(movablePieces(at('W:Wc3,a1:Bd4'), 'checkers')).toEqual([sq('c3')])
  })
})

describe('gameStatus', () => {
  it('is ongoing at the start', () => {
    expect(gameStatus(initialPosition('checkers'), 'checkers')).toBe('ongoing')
  })

  it('reports the winner when the side to move has no moves', () => {
    expect(gameStatus(at('W:W:Bd4'), 'checkers')).toBe('blackWins')
    expect(gameStatus(at('W:Wa1:Bb2,c3'), 'checkers')).toBe('blackWins')
    expect(gameStatus(at('B:Wa1,c1:Bb2'), 'checkers')).toBe('whiteWins')
  })

  it('reports a draw after 30 quiet king plies', () => {
    expect(gameStatus(at('W:WKa1:BKh8:29'), 'checkers')).toBe('ongoing')
    expect(gameStatus(at('W:WKa1:BKh8:30'), 'checkers')).toBe('draw')
  })
})

describe('gameStatus: поддавки', () => {
  it('is ongoing at the start', () => {
    expect(gameStatus(initialPosition('checkers'), 'giveaway')).toBe('ongoing')
  })

  it('reports the side with no moves as the winner', () => {
    expect(gameStatus(at('W:W:Bd4'), 'giveaway')).toBe('whiteWins')
    expect(gameStatus(at('W:Wa1:Bb2,c3'), 'giveaway')).toBe('whiteWins')
    expect(gameStatus(at('B:Wa1,c1:Bb2'), 'giveaway')).toBe('blackWins')
  })

  it('draws on the same counter as checkers', () => {
    expect(gameStatus(at('W:WKa1:BKh8:29'), 'giveaway')).toBe('ongoing')
    expect(gameStatus(at('W:WKa1:BKh8:30'), 'giveaway')).toBe('draw')
  })

  it('leaves the move list alone', () => {
    const p = at('W:Wc3,e3:Bd4,f6')
    expect(legalMoves(p, 'checkers')).toBe(legalMoves(p, 'checkers'))
    expect(gameStatus(p, 'checkers')).toBe('ongoing')
    expect(gameStatus(p, 'giveaway')).toBe('ongoing')
  })
})

describe('legalMoves: уголки', () => {
  it('lists the twelve opening moves', () => {
    expect(legalMoves(initialPosition('corners'), 'corners')).toHaveLength(12)
  })

  it('gives a chain its landing squares and takes nothing', () => {
    const moves = legalMoves(parseCorners('W:Wa1:Ba2,a4'), 'corners')
    const leap = moves.find((move) => move.to === sq('a5'))
    expect(leap?.path).toEqual([sq('a3'), sq('a5')])
    expect(leap?.captures).toEqual([])
    expect(leap?.promotes).toBe(false)
    expect(formatMove(leap!)).toBe('a1-a3-a5')
  })

  it('keeps the two games apart in the cache', () => {
    // A checkers opening is a legal уголки placement too; asked under each
    // game in turn, the same object gets each game's own moves.
    const position = initialPosition('checkers')
    const checkers = legalMoves(position, 'checkers')
    const corners = legalMoves(position, 'corners')
    expect(corners).not.toBe(checkers)
    expect(corners.map(formatMove)).toContain('a3-a4')
    expect(checkers.map(formatMove)).not.toContain('a3-a4')
    // One entry per position: the other game's list is made again.
    expect(legalMoves(position, 'corners')).toBe(corners)
    expect(legalMoves(position, 'checkers')).toEqual(checkers)
  })

  it('names the men that can move: every man but the corner one', () => {
    const movable = movablePieces(initialPosition('corners'), 'corners')
    expect(movable).toHaveLength(8)
    expect(movable).not.toContain(sq('a1'))
    expect(movesFrom(initialPosition('corners'), sq('a1'), 'corners')).toEqual(
      [],
    )
  })
})

describe('gameStatus: уголки', () => {
  it('is ongoing at the start', () => {
    expect(gameStatus(initialPosition('corners'), 'corners')).toBe('ongoing')
  })

  it('reads the race', () => {
    const done = 'Wf6,g6,h6,f7,g7,h7,f8,g8,h8'
    expect(
      gameStatus(
        parseCorners(`W:${done}:Bd4,d5,d6,e4,e5,e6,a1,b1,c1`),
        'corners',
      ),
    ).toBe('whiteWins')
    expect(
      gameStatus(
        parseCorners(`B:${done}:Bd4,d5,d6,e4,e5,e6,a1,b1,c1`),
        'corners',
      ),
    ).toBe('ongoing')
    expect(
      gameStatus(
        parseCorners(`W:${done}:Ba1,b1,c1,a2,b2,c2,a3,b3,c3`),
        'corners',
      ),
    ).toBe('draw')
  })

  it('reads the blocking rules', () => {
    expect(gameStatus(parseCorners('W:Wa1,d4:Bd5:80'), 'corners')).toBe(
      'blackWins',
    )
    expect(gameStatus(parseCorners('W:Wf6,d4:Bc3,d5:160'), 'corners')).toBe(
      'draw',
    )
  })

  it('loses the side with no move', () => {
    expect(
      gameStatus(parseCorners('W:Wb7:Bb8,a7,c7,b6,d7,b5'), 'corners'),
    ).toBe('blackWins')
  })
})
