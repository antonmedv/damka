import { describe, expect, it } from 'vitest'
import { fromBitPosition } from '../engine/adapter.ts'
import { parsePos } from '../engine/position.ts'
import { applyMove } from './apply.ts'
import { initialPosition, pieceAt, squareFromName } from './board.ts'
import { legalMoves } from './moves.ts'
import { formatMove } from './notation.ts'
import type { Move, Position } from './types.ts'

const sq = squareFromName
const c3 = sq('c3')
const d4 = sq('d4')
const quiet = (from: number, to: number): Move => ({
  from,
  to,
  captures: [],
  promotes: false,
  path: [to],
})
const at = (literal: string) => fromBitPosition(parsePos(literal))

/** Plays the legal move with this notation. */
function play(position: Position, notation: string): Position {
  const move = legalMoves(position, 'checkers').find(
    (m) => formatMove(m) === notation,
  )
  if (move === undefined) throw new Error(`no move ${notation}`)
  return applyMove(position, move)
}

describe('applyMove', () => {
  it('moves the piece and gives the turn to the other side', () => {
    const before = initialPosition('checkers')
    const after = applyMove(before, quiet(c3, d4))
    expect(pieceAt(after.board, c3)).toBeUndefined()
    expect(pieceAt(after.board, d4)).toEqual({ color: 'white', kind: 'man' })
    expect(after.toMove).toBe('black')
  })

  it('does not mutate the input position', () => {
    const before = initialPosition('checkers')
    applyMove(before, quiet(c3, d4))
    expect(pieceAt(before.board, c3)).toEqual({ color: 'white', kind: 'man' })
    expect(pieceAt(before.board, d4)).toBeUndefined()
    expect(before.toMove).toBe('white')
  })

  it('throws when there is no piece on the origin square', () => {
    expect(() => applyMove(initialPosition('checkers'), quiet(d4, c3))).toThrow(
      /no piece/,
    )
  })

  it('removes every captured piece at the end of the sequence', () => {
    const after = play(at('W:Wd2:Bc3,e3,c5,e5,g3'), 'd2:b4:d6:f4:h2')
    expect(pieceAt(after.board, sq('h2'))).toEqual({
      color: 'white',
      kind: 'man',
    })
    for (const name of ['c3', 'c5', 'e5', 'g3', 'd2']) {
      expect(pieceAt(after.board, sq(name))).toBeUndefined()
    }
    expect(pieceAt(after.board, sq('e3'))?.color).toBe('black')
  })

  it('promotes a man that reaches the back rank, also mid-capture', () => {
    const quietPromotion = play(at('W:Wa7:B'), 'a7-b8')
    expect(pieceAt(quietPromotion.board, sq('b8'))?.kind).toBe('king')
    const capturePromotion = play(at('W:Wb6:Bc7,f6'), 'b6:d8:h4')
    expect(pieceAt(capturePromotion.board, sq('h4'))?.kind).toBe('king')
  })
})

describe('applyMove: draw counter', () => {
  it('counts quiet king moves and resets on a man move or a capture', () => {
    let p = at('W:WKc1,h2:BKf8,a7')
    p = play(p, 'c1-d2')
    expect(p.drawCounter).toBe(1)
    p = play(p, 'f8-e7')
    expect(p.drawCounter).toBe(2)
    p = play(p, 'h2-g3')
    expect(p.drawCounter).toBe(0)
    p = play(p, 'e7-d6')
    expect(p.drawCounter).toBe(1)
    p = play(at('W:WKa1:Bc3,Kh8:5'), 'a1:d4')
    expect(p.drawCounter).toBe(0)
  })
})
