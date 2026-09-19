import { describe, expect, it } from 'vitest'
import { pieceAt, squareFromName } from '../game/board.ts'
import { initialPosition } from './board.ts'
import { formatCorners, parseCorners } from './position.ts'

const sq = squareFromName

describe('parseCorners', () => {
  it('places men of both colours and reads the side to move', () => {
    const p = parseCorners('B:Wa1,d5:Bh8')
    expect(p.toMove).toBe('black')
    expect(pieceAt(p.board, sq('a1'))).toEqual({ color: 'white', kind: 'man' })
    expect(pieceAt(p.board, sq('d5'))).toEqual({ color: 'white', kind: 'man' })
    expect(pieceAt(p.board, sq('h8'))).toEqual({ color: 'black', kind: 'man' })
    expect(p.board.filter((piece) => piece !== undefined)).toHaveLength(3)
    expect(p.ply).toBe(0)
    expect(p.drawCounter).toBe(0)
  })

  it('reads the ply count and allows an empty side', () => {
    expect(parseCorners('W:W:Bh8:81').ply).toBe(81)
    expect(parseCorners('W:Wa1:B').board[sq('a1')]).toBeDefined()
  })

  it('takes light squares, which checkers never uses', () => {
    expect(pieceAt(parseCorners('W:Wb1:B').board, sq('b1'))).toBeDefined()
  })

  it('rejects malformed literals', () => {
    expect(() => parseCorners('W:Wa1')).toThrow('invalid position literal')
    expect(() => parseCorners('X:Wa1:B')).toThrow('invalid side')
    expect(() => parseCorners('W:a1:B')).toThrow('invalid position literal')
    expect(() => parseCorners('W:Wa1:Ba1')).toThrow('square used twice')
    expect(() => parseCorners('W:Wa1:B:-1')).toThrow('invalid ply count')
    expect(() => parseCorners('W:Wa1:B:x')).toThrow('invalid ply count')
    expect(() => parseCorners('W:Wz9:B')).toThrow('invalid square name')
    expect(() => parseCorners('W:Wa10:B')).toThrow('invalid square name')
    expect(() => parseCorners('W:Wa1:Bh8:')).toThrow('invalid ply count')
  })

  it('refuses more men than the target has squares', () => {
    expect(() => parseCorners('W:Wa1,b1,c1,d1,e1,f1,g1,h1,a2,b2:Bh8')).toThrow(
      'too many white men',
    )
    expect(() => parseCorners('W:Wa1:Bh8,g8,f8,e8,d8,c8,b8,a8,h7,g7')).toThrow(
      'too many black men',
    )
  })
})

describe('formatCorners', () => {
  it('is the inverse of parseCorners in index order', () => {
    expect(formatCorners(parseCorners('B:Wd5,a1:Bh8:7'))).toBe('B:Wa1,d5:Bh8:7')
    expect(formatCorners(parseCorners('W:W:Bh8'))).toBe('W:W:Bh8')
  })

  it('writes the opening', () => {
    expect(formatCorners(initialPosition())).toBe(
      'W:Wa1,b1,c1,a2,b2,c2,a3,b3,c3:Bf6,g6,h6,f7,g7,h7,f8,g8,h8',
    )
  })
})
