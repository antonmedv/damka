import { describe, expect, it } from 'vitest'
import { squareFromName } from '../game/board.ts'
import type { Board, Piece } from '../game/types.ts'
import { detailedOf, fromBitPosition, toBitPosition } from './adapter.ts'
import { bit, fromSquare64 } from './bitboard.ts'
import { moveFrom, movePromotes, moveTo, packMove } from './move.ts'
import { MAX_MOVES, MOVE_SLOTS, generate } from './movegen.ts'
import { formatPos, initialBitPosition, parsePos } from './position.ts'
import { createRng, randomPlacement } from './random.ts'

describe('adapter', () => {
  it('round-trips positions between the UI and engine models', () => {
    for (const literal of [
      formatPos(initialBitPosition()),
      'B:Wa1,Kc3:Bf6,Kh8',
      'W:W:B',
      'W:WKh8:Ba1',
    ]) {
      const p = parsePos(literal)
      expect(formatPos(toBitPosition(fromBitPosition(p)))).toBe(literal)
    }
  })

  it('carries the draw counter both ways', () => {
    const position = fromBitPosition(parsePos('W:Wa1:Bh8:7'))
    expect(position.drawCounter).toBe(7)
    expect(toBitPosition(position).plies).toBe(7)
    expect(toBitPosition(position, 12).plies).toBe(12)
  })

  it('renders kings and men of both colours', () => {
    const { board, toMove } = fromBitPosition(parsePos('B:Wa1,Kc3:Bf6,Kh8'))
    expect(toMove).toBe('black')
    expect(board[squareFromName('a1')]).toEqual({ color: 'white', kind: 'man' })
    expect(board[squareFromName('c3')]).toEqual({
      color: 'white',
      kind: 'king',
    })
    expect(board[squareFromName('f6')]).toEqual({ color: 'black', kind: 'man' })
    expect(board[squareFromName('h8')]).toEqual({
      color: 'black',
      kind: 'king',
    })
    expect(board.filter((p) => p !== undefined)).toHaveLength(4)
  })

  it('rejects a piece on a light square', () => {
    const board: (Piece | undefined)[] = new Array<Piece | undefined>(64).fill(
      undefined,
    )
    board[squareFromName('b1')] = { color: 'white', kind: 'man' }
    const result: Board = board
    expect(() =>
      toBitPosition({ board: result, toMove: 'white', drawCounter: 0, ply: 0 }),
    ).toThrow('not a dark square')
  })
})

describe('detailedOf', () => {
  it('finds the UI move with the packed identity for every legal move', () => {
    const rng = createRng(17)
    const positions = [
      initialBitPosition(),
      parsePos('B:Wc3,e3,g3,d4,f4,b2,Kh2:Bd6,f6,c5,e5,g5,b6,Kb8'),
      parsePos('W:Wd6:Be7,g7,f4'),
    ]
    while (positions.length < 40) positions.push(randomPlacement(rng))
    const out = new Int32Array(MAX_MOVES * MOVE_SLOTS)
    for (const p of positions) {
      const count = generate(p.white, p.black, p.kings, p.side, out, 0)
      for (let i = 0; i < count * MOVE_SLOTS; i += MOVE_SLOTS) {
        const m0 = out[i]!
        const m1 = out[i + 1]!
        const move = detailedOf(p, m0, m1)
        expect(fromSquare64(move.from)).toBe(moveFrom(m0))
        expect(fromSquare64(move.to)).toBe(moveTo(m0))
        expect(move.promotes).toBe(movePromotes(m0) !== 0)
        let captured = 0
        for (const sq of move.captures) captured |= bit(fromSquare64(sq))
        expect(captured).toBe(m1)
        expect(move.path[move.path.length - 1]).toBe(move.to)
      }
    }
  })

  it('throws for a packed move that is not legal', () => {
    // a1-b2 is blocked in the initial position.
    expect(() =>
      detailedOf(initialBitPosition(), packMove(0, 4, 0, 0), 0),
    ).toThrow(/not legal/)
  })
})
