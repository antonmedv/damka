import { describe, expect, it } from 'vitest'
import { parsePos } from '../engine/position.ts'
import { fromBitPosition } from '../engine/adapter.ts'
import { initialPosition, squareFromName } from './board.ts'
import { gameStatus, legalMoves, movablePieces, movesFrom } from './moves.ts'
import { formatMove } from './notation.ts'

const sq = squareFromName
const at = (literal: string) => fromBitPosition(parsePos(literal))

describe('legalMoves', () => {
  it('lists the seven opening moves for white', () => {
    const moves = legalMoves(initialPosition()).map(formatMove).sort()
    expect(moves).toEqual(
      ['a3-b4', 'c3-b4', 'c3-d4', 'e3-d4', 'e3-f4', 'g3-f4', 'g3-h4'].sort(),
    )
  })

  it('returns the same list for the same position object', () => {
    const position = initialPosition()
    expect(legalMoves(position)).toBe(legalMoves(position))
  })

  it('returns only captures when a capture exists, with the full path', () => {
    const moves = legalMoves(at('W:Wc3,a1:Bd4,d6')).map(formatMove)
    expect(moves).toEqual(['c3:e5:c7'])
  })

  it('keeps every path when several lead to the same square', () => {
    const moves = legalMoves(at('W:Wd2:Bc3,e3,c5,e5,g3')).map(formatMove)
    expect(moves.sort()).toEqual(
      ['d2:b4:d6:f4:d2', 'd2:b4:d6:f4:h2', 'd2:f4:d6:b4:d2', 'd2:f4:h2'].sort(),
    )
  })
})

describe('movesFrom and movablePieces', () => {
  it('filters by origin', () => {
    const position = initialPosition()
    expect(
      movesFrom(position, sq('c3'))
        .map((m) => m.to)
        .sort(),
    ).toEqual([sq('b4'), sq('d4')].sort())
    expect(movesFrom(position, sq('a1'))).toEqual([])
    expect(movesFrom(position, sq('f6'))).toEqual([])
  })

  it('names only pieces that can move', () => {
    expect(
      movablePieces(initialPosition())
        .map((s) => s)
        .sort(),
    ).toEqual([sq('a3'), sq('c3'), sq('e3'), sq('g3')].sort())
    expect(movablePieces(at('W:Wc3,a1:Bd4'))).toEqual([sq('c3')])
  })
})

describe('gameStatus', () => {
  it('is ongoing at the start', () => {
    expect(gameStatus(initialPosition())).toBe('ongoing')
  })

  it('reports the winner when the side to move has no moves', () => {
    expect(gameStatus(at('W:W:Bd4'))).toBe('blackWins')
    expect(gameStatus(at('W:Wa1:Bb2,c3'))).toBe('blackWins')
    expect(gameStatus(at('B:Wa1,c1:Bb2'))).toBe('whiteWins')
  })

  it('reports a draw after 30 quiet king plies', () => {
    expect(gameStatus(at('W:WKa1:BKh8:29'))).toBe('ongoing')
    expect(gameStatus(at('W:WKa1:BKh8:30'))).toBe('draw')
  })
})
