import { describe, expect, it } from 'vitest'
import { fromBitPosition, toBitPosition } from './adapter.ts'
import { applyMove } from './apply.ts'
import { bit, fromSquare64, lsb, popcount, toSquare64 } from './bitboard.ts'
import {
  moveCaptureCount,
  moveFrom,
  moveKey,
  movePromotes,
  moveTo,
  packMove,
} from './move.ts'
import { MAX_MOVES, MOVE_SLOTS, generate, generateDetailed } from './movegen.ts'
import { formatPos, initialBitPosition, mirror, parsePos } from './position.ts'
import { createRng, randomPlacement, randomWalk } from './random.ts'
import { mailboxApply, mailboxMoves, uniqueMoves } from './reference/mailbox.ts'
import { describeMove, describeRules } from './rulesSuite.ts'
import type { BitPosition } from './position.ts'
import type { DetailedMove } from './move.ts'

describeRules('bitboard', generateDetailed)

function paths(moves: DetailedMove[]): string[] {
  return moves.map(describeMove).sort()
}

function outcomes(moves: DetailedMove[]): string[] {
  return [...new Set(moves.map(moveKey))].sort()
}

const PACKED = new Int32Array(MAX_MOVES * MOVE_SLOTS)

/** Outcome keys of the packed move list, as `moveKey` would spell them. */
function packedOutcomes(p: BitPosition): string[] {
  const count = generate(p.white, p.black, p.kings, p.side, PACKED, 0)
  expect(count).toBeLessThanOrEqual(MAX_MOVES)
  const keys: string[] = []
  for (let i = 0; i < count * MOVE_SLOTS; i += MOVE_SLOTS) {
    const m0 = PACKED[i]!
    const captured = PACKED[i + 1]!
    expect(moveCaptureCount(m0)).toBe(popcount(captured))
    const captures: number[] = []
    for (let rest = captured; rest !== 0; rest &= rest - 1) {
      captures.push(toSquare64(lsb(rest)))
    }
    keys.push(
      moveKey({
        from: toSquare64(moveFrom(m0)),
        to: toSquare64(moveTo(m0)),
        captures,
        promotes: movePromotes(m0) !== 0,
        path: [],
      }),
    )
  }
  return keys.sort()
}

function expectSameMoves(p: BitPosition): void {
  const position = fromBitPosition(p)
  const expected = mailboxMoves(position)
  const actual = generateDetailed(p)
  const literal = formatPos(p)
  expect(actual.length).toBeLessThanOrEqual(MAX_MOVES)
  expect(paths(actual), literal).toEqual(paths(expected))
  expect(outcomes(actual), literal).toEqual(outcomes(expected))
  // The packed list the search uses must hold exactly one move per outcome.
  expect(packedOutcomes(p), literal).toEqual(outcomes(expected))
  // Playing each move must also lead to the same position in both models.
  for (const move of uniqueMoves(expected)) {
    let captured = 0
    for (const sq of move.captures) captured |= bit(fromSquare64(sq))
    const m0 = packMove(
      fromSquare64(move.from),
      fromSquare64(move.to),
      move.promotes ? 1 : 0,
      move.captures.length,
    )
    const played = applyMove(p, m0, captured)
    const reference = toBitPosition(mailboxApply(position, move))
    expect(formatPos(played), `${literal} ${moveKey(move)}`).toBe(
      formatPos(reference),
    )
  }
}

/** The 180° turn maps every move of `p` onto a move of `mirror(p)`. */
function expectMirrorSymmetry(p: BitPosition): void {
  const flipped = generateDetailed(mirror(p)).map((m) => ({
    ...m,
    from: 63 - m.from,
    to: 63 - m.to,
    captures: m.captures.map((sq) => 63 - sq),
    path: m.path.map((sq) => 63 - sq),
  }))
  expect(paths(flipped), formatPos(p)).toEqual(paths(generateDetailed(p)))
}

describe('bitboard vs reference', () => {
  it('agrees on every position of 60 random games', () => {
    const rng = createRng(2026)
    let positions = 0
    for (let game = 0; game < 60; game++) {
      for (const p of randomWalk(rng, 200)) {
        expectSameMoves(p)
        positions++
      }
    }
    expect(positions).toBeGreaterThan(1000)
  })

  it('agrees on 3000 random placements', () => {
    const rng = createRng(7)
    for (let i = 0; i < 3000; i++) expectSameMoves(randomPlacement(rng))
  })

  it('is symmetric under the 180° turn', () => {
    const rng = createRng(99)
    for (let i = 0; i < 500; i++) expectMirrorSymmetry(randomPlacement(rng))
    for (const p of randomWalk(rng, 120)) expectMirrorSymmetry(p)
  })
})

describe('detailed moves', () => {
  it('reports the path and captures in jump order', () => {
    const [move] = generateDetailed(parsePos('W:Wc3:Bd4,d6'))
    expect(move).toBeDefined()
    expect(describeMove(move!)).toBe('c3:e5:c7')
    expect(move!.captures.length).toBe(2)
    expect(move!.path.length).toBe(2)
  })

  it('keeps every capture path, unlike the packed list', () => {
    expect(generateDetailed(parsePos('W:Wd2:Bc3,e3,c5,e5,g3'))).toHaveLength(4)
  })

  it('gives quiet moves a one-square path', () => {
    const moves = generateDetailed(initialBitPosition())
    expect(moves).toHaveLength(7)
    for (const m of moves) expect(m.path).toEqual([m.to])
  })
})
