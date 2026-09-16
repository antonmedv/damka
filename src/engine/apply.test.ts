import { describe, expect, it } from 'vitest'
import { applyMove } from './apply.ts'
import { squareFromName32 } from './bitboard.ts'
import { MAX_MOVES, MOVE_SLOTS, generate } from './movegen.ts'
import { moveFrom, moveTo } from './move.ts'
import { formatPos, parsePos } from './position.ts'
import type { BitPosition } from './position.ts'

const OUT = new Int32Array(MAX_MOVES * MOVE_SLOTS)

/** Plays the packed move from `from` to `to`; fails if it is not legal. */
function play(p: BitPosition, from: string, to: string): BitPosition {
  const count = generate(p.white, p.black, p.kings, p.side, OUT, 0)
  const f = squareFromName32(from)
  const t = squareFromName32(to)
  for (let i = 0; i < count * MOVE_SLOTS; i += MOVE_SLOTS) {
    const m0 = OUT[i]!
    if (moveFrom(m0) === f && moveTo(m0) === t)
      return applyMove(p, m0, OUT[i + 1]!)
  }
  throw new Error(`no move ${from}-${to} in ${formatPos(p)}`)
}

describe('makeMove', () => {
  it('moves a man and flips the side', () => {
    const next = play(parsePos('W:Wc3:Bf6'), 'c3', 'd4')
    expect(formatPos(next)).toBe('B:Wd4:Bf6')
  })

  it('removes captured pieces including kings', () => {
    const next = play(parsePos('W:WKa1:Bc3,Ke5'), 'a1', 'f6')
    expect(formatPos(next)).toBe('B:WKf6:B')
  })

  it('promotes a man that reaches the back rank', () => {
    expect(formatPos(play(parsePos('W:Wa7:B'), 'a7', 'b8'))).toBe('B:WKb8:B')
    expect(formatPos(play(parsePos('B:W:Bb2'), 'b2', 'a1'))).toBe('W:W:BKa1')
  })

  it('promotes a man that passes the back rank while capturing', () => {
    const next = play(parsePos('W:Wb6:Bc7,f6'), 'b6', 'h4')
    expect(formatPos(next)).toBe('B:WKh4:B')
  })

  it('handles a capture loop that ends on the origin square', () => {
    const next = play(parsePos('W:Wd2:Bc3,e3,c5,e5,g3'), 'd2', 'd2')
    expect(formatPos(next)).toBe('B:Wd2:Bg3')
  })

  it('never mutates its input', () => {
    const p = parsePos('W:Wc3:Bf6')
    const copy = { ...p }
    play(p, 'c3', 'd4')
    expect(p).toEqual(copy)
  })
})

describe('draw counter', () => {
  it('counts quiet king moves and resets on a man move', () => {
    let p = parsePos('W:WKc1,h2:BKf8,a7')
    p = play(p, 'c1', 'd2')
    expect(p.plies).toBe(1)
    p = play(p, 'f8', 'e7')
    expect(p.plies).toBe(2)
    p = play(p, 'd2', 'c1')
    expect(p.plies).toBe(3)
    p = play(p, 'a7', 'b6')
    expect(p.plies).toBe(0)
    p = play(p, 'c1', 'd2')
    expect(p.plies).toBe(1)
    p = play(p, 'b6', 'a5')
    expect(p.plies).toBe(0)
    p = play(p, 'd2', 'e3')
    expect(p.plies).toBe(1)
    p = play(p, 'e7', 'd6')
    expect(p.plies).toBe(2)
    p = play(p, 'e3', 'd2')
    expect(p.plies).toBe(3)
    p = play(p, 'd6', 'c7')
    expect(p.plies).toBe(4)
  })

  it('resets on a capture, even by a king', () => {
    const p = play(parsePos('W:WKa1:Bc3,Kh8:5'), 'a1', 'd4')
    expect(p.plies).toBe(0)
  })

  it('resets when a man promotes', () => {
    const p = play(parsePos('W:Wa7,Kc1:BKh8:12'), 'a7', 'b8')
    expect(p.plies).toBe(0)
  })

  it('keeps counting from the literal value', () => {
    const p = play(parsePos('W:WKa1:BKh8:29'), 'a1', 'b2')
    expect(p.plies).toBe(30)
  })
})
