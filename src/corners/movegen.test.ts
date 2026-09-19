import { describe, expect, it } from 'vitest'
import { fileOf, rankOf, squareFromName } from '../game/board.ts'
import { formatMove } from '../game/notation.ts'
import type { Move, Position } from '../game/types.ts'
import { createRng } from '../engine/random.ts'
import { moveFrom, moveTo } from './apply.ts'
import { BLACK, WHITE, initialPosition, load } from './board.ts'
import { MAX_MOVES, detailedOf, generate, generateDetailed } from './movegen.ts'
import { parseCorners } from './position.ts'
import { randomPlacement, randomWalk } from './random.ts'

const sq = squareFromName
const OUT = new Int32Array(MAX_MOVES)

/** Moves as `from-to` strings, sorted, so two generators can be compared. */
function ends(moves: ReadonlyArray<{ from: number; to: number }>): string[] {
  return moves.map((m) => `${m.from}-${m.to}`).sort()
}

function packed(position: Position): { from: number; to: number }[] {
  load(position)
  const side = position.toMove === 'white' ? WHITE : BLACK
  const count = generate(side, OUT, 0)
  const moves: { from: number; to: number }[] = []
  for (let i = 0; i < count; i++) {
    moves.push({ from: moveFrom(OUT[i]!), to: moveTo(OUT[i]!) })
  }
  return moves
}

/**
 * Plain reference: the rules written the obvious way over the UI board,
 * with sets and recursion. Steps to empty neighbours; jumps by walking
 * every chain and collecting the squares landed on.
 */
function referenceMoves(position: Position): { from: number; to: number }[] {
  const occupied = (s: number) => position.board[s] !== undefined
  const neighbour = (s: number, dir: number): number | null => {
    const file = fileOf(s)
    const rank = rankOf(s)
    if (dir === 0) return file > 0 ? s - 1 : null
    if (dir === 1) return file < 7 ? s + 1 : null
    if (dir === 2) return rank > 0 ? s - 8 : null
    return rank < 7 ? s + 8 : null
  }
  const moves: { from: number; to: number }[] = []
  position.board.forEach((piece, from) => {
    if (piece?.color !== position.toMove) return
    const landings = new Set<number>()
    for (let dir = 0; dir < 4; dir++) {
      const to = neighbour(from, dir)
      if (to !== null && !occupied(to)) moves.push({ from, to })
    }
    const chain = (at: number): void => {
      for (let dir = 0; dir < 4; dir++) {
        const over = neighbour(at, dir)
        if (over === null || over === from || !occupied(over)) continue
        const land = neighbour(over, dir)
        if (land === null || land === from || occupied(land)) continue
        if (landings.has(land)) continue
        landings.add(land)
        chain(land)
      }
    }
    chain(from)
    for (const to of landings) moves.push({ from, to })
  })
  return moves
}

describe('generate', () => {
  it('lists the opening moves for White', () => {
    // The men on the edge of the home step out, and the men one square in
    // jump over them; the corner man a1 has nowhere to go at all.
    const moves = generateDetailed(initialPosition()).map(formatMove).sort()
    expect(moves).toEqual(
      [
        'c1-d1',
        'c2-d2',
        'c3-d3',
        'a3-a4',
        'b3-b4',
        'c3-c4',
        'b1-d1',
        'b2-d2',
        'b3-d3',
        'a2-a4',
        'b2-b4',
        'c2-c4',
      ].sort(),
    )
  })

  it('agrees with the reference along random games', () => {
    const rng = createRng(3)
    for (const position of randomWalk(rng, 300)) {
      expect(ends(packed(position))).toEqual(ends(referenceMoves(position)))
    }
  })

  it('agrees with the reference on random placements', () => {
    const rng = createRng(11)
    for (let i = 0; i < 2000; i++) {
      const position = randomPlacement(rng)
      expect(ends(packed(position))).toEqual(ends(referenceMoves(position)))
    }
  })

  it('never lands a chain back on its own square', () => {
    // a1 can go a1→a3→c3→c1 and from c1 over b1 back onto a1; it must not.
    const moves = packed(parseCorners('W:Wa1,a2,b3,c2,b1:B'))
    expect(moves.some((m) => m.from === m.to)).toBe(false)
    expect(ends(moves)).toContain(`${sq('a1')}-${sq('c1')}`)
    expect(ends(moves)).toContain(`${sq('a1')}-${sq('c3')}`)
  })

  it('jumps over men of either colour', () => {
    expect(ends(packed(parseCorners('W:Wa1:Bb1')))).toContain(
      `${sq('a1')}-${sq('c1')}`,
    )
    expect(ends(packed(parseCorners('W:Wa1,b1:B')))).toContain(
      `${sq('a1')}-${sq('c1')}`,
    )
  })

  it('gives a lone man its four steps', () => {
    load(parseCorners('W:Wd4:B'))
    expect(generate(WHITE, OUT, 0)).toBe(4)
  })
})

describe('generateDetailed', () => {
  it('gives a step a one-square path and a chain every landing square', () => {
    const moves = generateDetailed(parseCorners('W:Wa1:Ba2,a4,b5'))
    const byTo = new Map(moves.map((m) => [m.to, m]))
    expect(byTo.get(sq('b1'))?.path).toEqual([sq('b1')])
    expect(byTo.get(sq('a3'))?.path).toEqual([sq('a3')])
    expect(byTo.get(sq('a5'))?.path).toEqual([sq('a3'), sq('a5')])
    expect(byTo.get(sq('c5'))?.path).toEqual([sq('a3'), sq('a5'), sq('c5')])
    expect(formatMove(byTo.get(sq('c5'))!)).toBe('a1-a3-a5-c5')
  })

  it('takes the shortest chain when several reach a square', () => {
    // a1 → c1 directly over b1, or the long way round a3, c3, c1.
    const moves = generateDetailed(parseCorners('W:Wa1,a2,b1,c2,b3:B'))
    const toC1 = moves.filter((m) => m.from === sq('a1') && m.to === sq('c1'))
    expect(toC1).toHaveLength(1)
    expect(toC1[0]!.path).toEqual([sq('c1')])
  })

  it('carries no captures and no promotion, whatever the rank', () => {
    const moves = generateDetailed(parseCorners('W:Wa7:B'))
    expect(moves.map(formatMove).sort()).toEqual(['a7-a6', 'a7-a8', 'a7-b7'])
    for (const move of moves) {
      expect(move.captures).toEqual([])
      expect(move.promotes).toBe(false)
    }
  })

  it('lists one move per destination', () => {
    const rng = createRng(5)
    for (const position of randomWalk(rng, 100)) {
      const moves: Move[] = generateDetailed(position)
      expect(new Set(ends(moves)).size).toBe(moves.length)
    }
  })
})

describe('detailedOf', () => {
  const position = parseCorners('W:Wa1:Ba2,a4,b5')

  it('finds the UI move, path and all, for a packed square pair', () => {
    const move = detailedOf(position, sq('a1') | (sq('c5') << 6))
    expect(formatMove(move)).toBe('a1-a3-a5-c5')
  })

  it('refuses a pair that is not a legal move', () => {
    expect(() => detailedOf(position, sq('a1') | (sq('a2') << 6))).toThrow(
      'a1-a2 is not legal in W:Wa1:Ba2,a4,b5',
    )
  })
})
