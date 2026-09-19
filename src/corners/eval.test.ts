import { afterEach, describe, expect, it } from 'vitest'
import { MATE_BOUND } from '../engine/score.ts'
import { createRng } from '../engine/random.ts'
import { squareFromName } from '../game/board.ts'
import type { Piece, Position } from '../game/types.ts'
import { BLACK, WHITE, initialPosition, load, turned } from './board.ts'
import {
  COST,
  DEFAULT_WEIGHTS,
  EVAL_MAX,
  currentWeights,
  evaluate,
  weights,
} from './eval.ts'
import { parseCorners } from './position.ts'
import { randomPlacement } from './random.ts'

const sq = squareFromName

afterEach(() => {
  weights(DEFAULT_WEIGHTS)
})

/**
 * The position turned 180° with the colours swapped: the same game seen
 * from the other side, so the side to move is in the same spot.
 */
function mirror(position: Position): Position {
  const board: (Piece | undefined)[] = new Array<Piece | undefined>(64).fill(
    undefined,
  )
  position.board.forEach((piece, s) => {
    if (piece === undefined) return
    board[turned(s)] = {
      color: piece.color === 'white' ? 'black' : 'white',
      kind: piece.kind,
    }
  })
  return {
    ...position,
    board,
    toMove: position.toMove === 'white' ? 'black' : 'white',
  }
}

function score(position: Position): number {
  load(position)
  return evaluate(position.toMove === 'white' ? WHITE : BLACK)
}

describe('COST', () => {
  it('charges a step per square outside and less inside', () => {
    const { step, inside } = DEFAULT_WEIGHTS
    const deepest = inside * 4
    expect(COST[WHITE * 64 + sq('a1')]).toBe(10 * step + deepest)
    expect(COST[WHITE * 64 + sq('e6')]).toBe(step + deepest)
    expect(COST[WHITE * 64 + sq('f6')]).toBe(deepest)
    expect(COST[WHITE * 64 + sq('g7')]).toBe(inside * 2)
    expect(COST[WHITE * 64 + sq('h8')]).toBe(0)
  })

  it('makes entering the target worth exactly one more step', () => {
    const outside = COST[WHITE * 64 + sq('e6')]!
    const entrance = COST[WHITE * 64 + sq('f6')]!
    expect(outside - entrance).toBe(DEFAULT_WEIGHTS.step)
  })

  it('is the same table for Black, turned round', () => {
    for (let s = 0; s < 64; s++) {
      expect(COST[BLACK * 64 + s]).toBe(COST[WHITE * 64 + turned(s)])
    }
  })
})

describe('evaluate', () => {
  it('is level at the start, bar the tempo', () => {
    expect(score(initialPosition())).toBe(DEFAULT_WEIGHTS.tempo)
  })

  it('reads the same from both sides of the board', () => {
    const rng = createRng(7)
    for (let i = 0; i < 500; i++) {
      const p = randomPlacement(rng)
      expect(score(mirror(p))).toBe(score(p))
    }
  })

  it('changes sign with the side to move', () => {
    const p = parseCorners('W:Wd4:Bh8')
    const other = parseCorners('B:Wd4:Bh8')
    const tempo = DEFAULT_WEIGHTS.tempo
    expect(score(other) - tempo).toBe(-(score(p) - tempo))
  })

  it('prefers the man who has come further', () => {
    const behind = score(parseCorners('W:Wa1:Bh8'))
    const ahead = score(parseCorners('W:Wd4:Bh8'))
    expect(ahead).toBeGreaterThan(behind)
    expect(ahead - behind).toBe(
      6 * DEFAULT_WEIGHTS.step +
        Math.trunc(
          (6 * DEFAULT_WEIGHTS.step * DEFAULT_WEIGHTS.straggler) / 100,
        ),
    )
  })

  it('wants the back of the target filled first', () => {
    expect(score(parseCorners('W:Wh8:Ba1'))).toBeGreaterThan(
      score(parseCorners('W:Wf6:Ba1')),
    )
  })

  it('counts the straggler again', () => {
    // The same distance in total: two men three squares out, against one
    // man six squares out and one already home.
    weights({ ...DEFAULT_WEIGHTS, straggler: 100 })
    const spread = score(parseCorners('W:Wd5,e4:B'))
    const straggling = score(parseCorners('W:Wf6,c3:B'))
    expect(spread).toBeGreaterThan(straggling)
  })

  it('stays inside EVAL_MAX and below the mate band at the worst', () => {
    // No man costs more than the corner man at home, and a side has nine
    // of them plus the straggler; the other side may cost nothing.
    const dearest = COST[WHITE * 64 + sq('a1')]!
    const worstCase = 9 * dearest + (dearest * DEFAULT_WEIGHTS.straggler) / 100
    expect(worstCase + DEFAULT_WEIGHTS.tempo).toBeLessThan(EVAL_MAX)
    expect(EVAL_MAX).toBeLessThan(MATE_BOUND)
    // And a position that comes close to it.
    const lead = parseCorners(
      'B:Wa1,b1,c1,a2,b2,c2,a3,b3,c3:Bd1,e1,f1,d2,e2,f2,d3,e3,f3',
    )
    expect(Math.abs(score(lead))).toBeLessThan(EVAL_MAX)
  })

  it('refuses weights that reach the mate band and keeps the old tables', () => {
    const before = COST[WHITE * 64 + sq('a1')]
    expect(() => weights({ ...DEFAULT_WEIGHTS, step: 3000 })).toThrow(
      /mate band/,
    )
    expect(COST[WHITE * 64 + sq('a1')]).toBe(before)
    expect(currentWeights()).toBe(DEFAULT_WEIGHTS)
  })

  it('refuses a weight that is not a number before touching the tables', () => {
    const before = COST[WHITE * 64 + sq('a1')]
    expect(() => weights({ ...DEFAULT_WEIGHTS, inside: NaN })).toThrow(
      'weight inside is NaN',
    )
    expect(() => weights({ ...DEFAULT_WEIGHTS, tempo: Infinity })).toThrow(
      /tempo/,
    )
    expect(COST[WHITE * 64 + sq('a1')]).toBe(before)
    expect(currentWeights()).toBe(DEFAULT_WEIGHTS)
  })

  it('rebuilds the tables when the weights change', () => {
    weights({ step: 50, inside: 5, straggler: 0, tempo: 0 })
    expect(currentWeights().step).toBe(50)
    expect(COST[WHITE * 64 + sq('a1')]).toBe(10 * 50 + 20)
    expect(score(initialPosition())).toBe(0)
  })
})
