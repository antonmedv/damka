/**
 * Rule scenarios from RULES.md, shared by the reference and the bitboard
 * generators. Each expected move is written as `from-to` (quiet) or
 * `from:land:land…` (capture path), with `=K` when the move promotes.
 */
import { describe, expect, it } from 'vitest'
import { squareName } from '../game/board.ts'
import type { DetailedMove } from './move.ts'
import { parsePos } from './position.ts'
import type { BitPosition } from './position.ts'

export type MoveGenerator = (position: BitPosition) => DetailedMove[]

export function describeMove(move: DetailedMove): string {
  const separator = move.captures.length > 0 ? ':' : '-'
  const path = move.path.map(squareName).join(':')
  return `${squareName(move.from)}${separator}${path}${move.promotes ? '=K' : ''}`
}

function movesOf(generate: MoveGenerator, literal: string): string[] {
  return generate(parsePos(literal)).map(describeMove).sort()
}

export function describeRules(name: string, generate: MoveGenerator): void {
  const expectMoves = (literal: string, expected: string[]): void => {
    expect(movesOf(generate, literal)).toEqual([...expected].sort())
  }

  describe(`${name}: rules`, () => {
    it('initial position: seven moves for each side', () => {
      expectMoves(
        'W:Wa1,c1,e1,g1,b2,d2,f2,h2,a3,c3,e3,g3:Bb6,d6,f6,h6,a7,c7,e7,g7,b8,d8,f8,h8',
        ['a3-b4', 'c3-b4', 'c3-d4', 'e3-d4', 'e3-f4', 'g3-f4', 'g3-h4'],
      )
      expectMoves(
        'B:Wa1,c1,e1,g1,b2,d2,f2,h2,a3,c3,e3,g3:Bb6,d6,f6,h6,a7,c7,e7,g7,b8,d8,f8,h8',
        ['b6-a5', 'b6-c5', 'd6-c5', 'd6-e5', 'f6-e5', 'f6-g5', 'h6-g5'],
      )
    })

    it('a man moves one square diagonally forward only', () => {
      expectMoves('W:Wd4:B', ['d4-c5', 'd4-e5'])
      expectMoves('B:W:Bd4', ['d4-c3', 'd4-e3'])
      expectMoves('W:Wa3:B', ['a3-b4'])
      expectMoves('W:Wd4,c5:B', ['c5-b6', 'c5-d6', 'd4-e5'])
    })

    it('a man captures backward and stays a man on its own back rank', () => {
      expectMoves('W:Wa3:Bb2', ['a3:c1'])
      expectMoves('B:Wg7:Bh6', ['h6:f8'])
    })

    it('capturing is mandatory and hides quiet moves', () => {
      expectMoves('W:Wc3,a1:Bd4', ['c3:e5'])
      expectMoves('W:Wc3,Ka1:Bd4', ['c3:e5'])
    })

    it('the same piece must continue while another capture exists', () => {
      expectMoves('W:Wc3:Bd4,d6', ['c3:e5:c7'])
    })

    it('any complete sequence may be chosen, not only the longest', () => {
      expectMoves('W:Wc3:Bb4,d4,d6', ['c3:a5', 'c3:e5:c7'])
    })

    it('a piece is captured once, and the origin square is empty meanwhile', () => {
      // Go engine test "5Bear": the man loops around and may end on its origin.
      expectMoves('W:Wd2:Bc3,e3,c5,e5,g3', [
        'd2:b4:d6:f4:d2',
        'd2:b4:d6:f4:h2',
        'd2:f4:d6:b4:d2',
        'd2:f4:h2',
      ])
    })

    it('captured pieces stay on the board and block landing squares', () => {
      // c3xd4 may land e5 or f6 (both continue), never g7 or h8. Via f6:
      // f6xg5 lands h4, h4xg3 lands f2 or e1. From f2 the capture of e3 is
      // impossible because d4 is still occupied by the captured man.
      expectMoves('W:WKc3:Bd4,g5,g3,e3', [
        'c3:e5:h2',
        'c3:f6:h4:f2',
        'c3:f6:h4:e1',
      ])
    })

    it('a king flies any distance over empty squares', () => {
      expectMoves('W:WKd4:B', [
        'd4-c3',
        'd4-b2',
        'd4-a1',
        'd4-e5',
        'd4-f6',
        'd4-g7',
        'd4-h8',
        'd4-c5',
        'd4-b6',
        'd4-a7',
        'd4-e3',
        'd4-f2',
        'd4-g1',
      ])
      expectMoves('W:WKa1:B', [
        'a1-b2',
        'a1-c3',
        'a1-d4',
        'a1-e5',
        'a1-f6',
        'a1-g7',
        'a1-h8',
      ])
      expectMoves('W:WKa1,c3:B', ['a1-b2', 'c3-b4', 'c3-d4'])
    })

    it('a king capture needs an empty square behind the piece', () => {
      expectMoves('W:WKa1:Bb2,c3', [])
      expectMoves('W:WKa1:Bc3,d4', ['a1-b2'])
      expectMoves('W:WKa1:Bc3', ['a1:d4', 'a1:e5', 'a1:f6', 'a1:g7', 'a1:h8'])
    })

    it('a king lands where it can keep capturing when such a square exists', () => {
      // Go engine test "Bug3".
      expectMoves('B:Wc3,f4,h2:BKa1', ['a1:e5:g3'])
      expectMoves('W:WKa1:Be5,e7,g5', ['a1:f6:d8', 'a1:f6:h4'])
      // Go engine test "Bug1": only one landing square is free.
      expectMoves('B:WKa7,c5:BKd4', ['d4:b6'])
      expectMoves('B:WKa7,c5:Bd4', ['d4:b6'])
    })

    it('a king may change direction between captures', () => {
      expectMoves('W:WKa1:Bc3,c7', ['a1:e5:b8'])
    })

    it('a king may pass over and land on its own origin square', () => {
      // Four men around the king; both loops end on c3 or beyond it.
      expectMoves('W:WKc3:Bb4,b6,d6,d4', [
        'c3:a5:c7:e5:c3',
        'c3:a5:c7:e5:b2',
        'c3:a5:c7:e5:a1',
        'c3:e5:c7:a5:c3',
        'c3:e5:c7:a5:d2',
        'c3:e5:c7:a5:e1',
      ])
    })

    it('a captured piece blocks the king from reaching pieces behind it', () => {
      // e1xd2 must land b4 (c5 continues); from d6/e7/f8 the captured c5
      // hides a3, so a3 is never taken.
      expectMoves('W:WKe1:Bd2,c5,a3', ['e1:b4:d6', 'e1:b4:e7', 'e1:b4:f8'])
    })

    it('a quiet move to the back rank promotes and ends the move', () => {
      expectMoves('W:Wa7:B', ['a7-b8=K'])
      expectMoves('B:W:Bb2', ['b2-a1=K', 'b2-c1=K'])
    })

    it('a man promoted during a capture continues as a king', () => {
      // Go engine test: b6xc7 lands d8 as a king, which then takes f6.
      expectMoves('W:Wb6:Bc7,f6', ['b6:d8:g5=K', 'b6:d8:h4=K'])
      expectMoves('B:Wd2,g3:Bc3', ['c3:e1:h4=K'])
    })

    it('a promoted man that cannot continue simply becomes a king', () => {
      expectMoves('W:Wb6:Bc7', ['b6:d8=K'])
    })

    it('a side with no pieces or no moves has no legal moves', () => {
      expectMoves('W:W:Bd4', [])
      expectMoves('W:Wa1:Bb2,c3', [])
      expectMoves('B:Wa1,c1:Bb2', [])
    })
  })
}
