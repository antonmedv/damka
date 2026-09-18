import { beforeEach, describe, expect, it } from 'vitest'
import { APPLIED, makeMove } from './apply.ts'
import { squareFromName32 } from './bitboard.ts'
import { evaluate } from './eval.ts'
import { moveFrom, moveTo } from './move.ts'
import { MAX_MOVES, MOVE_SLOTS, generate } from './movegen.ts'
import { initialBitPosition, parsePos } from './position.ts'
import type { BitPosition } from './position.ts'
import { createRng, randomWalk } from './random.ts'
import { INF, MATE, MAX_PLY, matedScore } from './score.ts'
import { DRAW_PLIES } from './status.ts'
import { ROOT_SLOTS, search, searchStats } from './search.ts'
import type { SearchResult } from './search.ts'
import { EXACT, UPPER, ttClear } from './tt.ts'
import { CHECKERS, GIVEAWAY } from './variant.ts'

const sq = squareFromName32

function run(p: BitPosition, depth: number, margin = 0): SearchResult {
  return search(p.white, p.black, p.kings, p.side, p.plies, {
    variant: CHECKERS,
    depth,
    budgetMs: 0,
    margin,
  })
}

function bestMove(r: SearchResult): string {
  return `${moveFrom(r.m0)}-${moveTo(r.m0)}`
}

function name(from: string, to: string): string {
  return `${sq(from)}-${sq(to)}`
}

function rootScores(r: SearchResult): Map<string, number> {
  const scores = new Map<string, number>()
  for (let i = 0; i < r.root.length; i += ROOT_SLOTS) {
    const m0 = r.root[i]!
    scores.set(`${moveFrom(m0)}-${moveTo(m0)}`, r.root[i + 2]!)
  }
  return scores
}

function child(p: BitPosition, m0: number, m1: number): BitPosition {
  makeMove(p.white, p.black, p.kings, p.side, p.plies, m0, m1)
  return {
    white: APPLIED[0]!,
    black: APPLIED[1]!,
    kings: APPLIED[2]!,
    side: p.side === 0 ? 1 : 0,
    plies: APPLIED[3]!,
  }
}

function legal(p: BitPosition): Set<string> {
  const out = new Int32Array(MAX_MOVES * MOVE_SLOTS)
  const count = generate(p.white, p.black, p.kings, p.side, out, 0)
  const moves = new Set<string>()
  for (let i = 0; i < count; i++) {
    moves.add(`${out[i * 2]},${out[i * 2 + 1]}`)
  }
  return moves
}

/**
 * Full-width negamax with the same tree rules as `search` and no pruning:
 * loss before draw, path repetition within `plies`, captures always
 * searched, a single quiet move free of charge, evaluation at `MAX_PLY`.
 */
function reference(
  p: BitPosition,
  depth: number,
  ply: number,
  path: BitPosition[],
): number {
  if (ply >= MAX_PLY) return evaluate(p.white, p.black, p.kings, p.side)
  const out = new Int32Array(MAX_MOVES * MOVE_SLOTS)
  const count = generate(p.white, p.black, p.kings, p.side, out, 0)
  if (count === 0) return matedScore(ply)
  if (p.plies >= DRAW_PLIES) return 0
  for (let k = ply - 2; k >= 0 && k >= ply - p.plies; k -= 2) {
    const q = path[k]!
    if (q.white === p.white && q.black === p.black && q.kings === p.kings) {
      return 0
    }
  }
  const captures = out[1] !== 0
  if (depth <= 0 && !captures) {
    return evaluate(p.white, p.black, p.kings, p.side)
  }
  path[ply] = p
  const childDepth = count === 1 && !captures ? depth : depth - 1
  let best = -INF
  for (let i = 0; i < count * MOVE_SLOTS; i += MOVE_SLOTS) {
    const q = child(p, out[i]!, out[i + 1]!)
    best = Math.max(best, 0 - reference(q, childDepth, ply + 1, path))
  }
  return best
}

/**
 * Opening and early midgame positions of random games: men only, several
 * moves everywhere, so neither the repetition heuristic nor a deeper table
 * entry from a forced-move extension can make the table's answer differ
 * from a plain fixed-depth search.
 */
function earlyPositions(count: number): BitPosition[] {
  const rng = createRng(31)
  const positions: BitPosition[] = []
  while (positions.length < count) {
    for (const p of randomWalk(rng, 40).slice(2)) {
      if (positions.length < count) positions.push(p)
    }
  }
  return positions
}

beforeEach(() => {
  ttClear()
})

describe('search: tactics', () => {
  it('wins in one by taking the last piece', () => {
    const r = run(parsePos('W:Wc3:Bd4'), 1)
    expect(r.score).toBe(MATE - 1)
    expect(bestMove(r)).toBe(name('c3', 'e5'))
  })

  it('finds a mate in three through a forced reply', () => {
    // a3-b4 waits; h6-g5 is Black's only move; f4xg5 takes the last man.
    const r = run(parsePos('W:Wf4,a3:Bh6'), 3)
    expect(r.score).toBe(MATE - 3)
    expect(bestMove(r)).toBe(name('a3', 'b4'))
  })

  it('prefers the shorter win when searching deeper', () => {
    const p = parsePos('W:WKc1:Bh6')
    expect(run(p, 3).score).toBe(MATE - 3)
    expect(run(p, 7).score).toBe(MATE - 3)
  })

  it('does not stop at depth 0 before a forced recapture', () => {
    // Both captures of b4 leave two men against a king, but the man that
    // lands on c5 is taken by the king from g1 along the long diagonal.
    // Only the capture search at depth 0 sees that.
    const p = parsePos('W:Wa3,c3:Bb4,Kg1')
    const r = run(p, 1)
    expect(bestMove(r)).toBe(name('c3', 'a5'))
    const scores = rootScores(r)
    expect(scores.get(name('a3', 'c5'))).toBeLessThan(-150)
    expect(scores.get(name('c3', 'a5'))).toBeGreaterThan(-150)
  })

  it('scores the 30-ply draw as zero', () => {
    const r = run(parsePos('W:WKa1:BKh8:29'), 3)
    expect(r.score).toBe(0)
  })

  it('reports a lost position without moves', () => {
    const r = run(parsePos('W:W:Bd4'), 3)
    expect(r.score).toBe(matedScore(0))
    expect(r.root.length).toBe(0)
  })

  it('offers no move from a position drawn by the 30-ply rule', () => {
    const r = run(parsePos('W:WKa1:Bc3:30'), 6)
    expect(r.score).toBe(0)
    expect(r.root.length).toBe(0)
    expect(r.m0).toBe(0)
  })
})

describe('search: against a full-width reference', () => {
  it('returns the reference score on early positions', () => {
    for (const p of earlyPositions(40)) {
      ttClear()
      expect(run(p, 3).score).toBe(reference(p, 3, 0, []))
    }
    for (const p of earlyPositions(10)) {
      ttClear()
      expect(run(p, 5).score).toBe(reference(p, 5, 0, []))
    }
  })

  it('keeps exact scores within the margin once aspiration windows start', () => {
    // Depth 4 is the first aspirated iteration; the window is ±100, the
    // margin 150, so the low edge has to follow the margin.
    const margin = 150
    let candidates = 0
    for (const p of earlyPositions(10)) {
      ttClear()
      const r = run(p, 4, margin)
      for (let i = 0; i < r.root.length; i += ROOT_SLOTS) {
        const q = child(p, r.root[i]!, r.root[i + 1]!)
        const exact = 0 - reference(q, 3, 1, [p])
        if (exact < r.score - margin) continue
        candidates++
        expect(r.root[i + 3]).toBe(EXACT)
        expect(r.root[i + 2]).toBe(exact)
      }
    }
    expect(candidates).toBeGreaterThan(10)
  })

  it('gives every root move its exact score under a wide margin', () => {
    for (const p of earlyPositions(12)) {
      ttClear()
      const r = run(p, 3, INF)
      for (let i = 0; i < r.root.length; i += ROOT_SLOTS) {
        const q = child(p, r.root[i]!, r.root[i + 1]!)
        expect(r.root[i + 3]).toBe(EXACT)
        expect(r.root[i + 2]).toBe(0 - reference(q, 2, 1, [p]))
      }
    }
  })

  it('lists the best move first and marks the rest exact or upper bounds', () => {
    let upperSeen = 0
    for (const p of earlyPositions(24)) {
      const r = run(p, 4, 0)
      expect(r.root[0]).toBe(r.m0)
      expect(r.root[1]).toBe(r.m1)
      expect(r.root[2]).toBe(r.score)
      expect(r.root[3]).toBe(EXACT)
      for (let i = ROOT_SLOTS; i < r.root.length; i += ROOT_SLOTS) {
        const score = r.root[i + 2]!
        const bound = r.root[i + 3]!
        expect(score).toBeLessThanOrEqual(r.score)
        if (bound === UPPER) {
          expect(score).toBeLessThan(r.score)
          upperSeen++
        } else {
          expect(bound).toBe(EXACT)
        }
      }
    }
    expect(upperSeen).toBeGreaterThan(0)
  })
})

describe('search: table and time', () => {
  it('is deterministic from an empty table', () => {
    const p = earlyPositions(20)[19]!
    const a = run(p, 6)
    ttClear()
    const b = run(p, 6)
    expect(b).toEqual(a)
  })

  it('hits the table while deepening', () => {
    run(initialBitPosition(), 8)
    const stats = searchStats()
    expect(stats.ttProbes).toBeGreaterThan(0)
    expect(stats.ttHits).toBeGreaterThan(stats.ttProbes / 20)
  })

  it('needs far fewer nodes than the depth-8 baseline without ordering', () => {
    // 93 667 nodes with plain alpha-beta in generation order.
    const r = run(initialBitPosition(), 8)
    expect(r.depth).toBe(8)
    expect(r.nodes).toBeLessThan(40000)
  })

  it('plays a legal move within the time budget', () => {
    const p = initialBitPosition()
    const start = performance.now()
    const r = search(p.white, p.black, p.kings, p.side, p.plies, {
      variant: CHECKERS,
      depth: 64,
      budgetMs: 40,
      margin: 0,
    })
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(400)
    expect(r.depth).toBeGreaterThanOrEqual(1)
    expect(r.depth).toBeLessThan(64)
    expect(legal(p).has(`${r.m0},${r.m1}`)).toBe(true)
    expect(r.root.length).toBe(legal(p).size * ROOT_SLOTS)
  })

  it('never aborts a fixed-depth search', () => {
    const r = run(initialBitPosition(), 6)
    expect(r.depth).toBe(6)
  })

  it('keeps root, best move and score consistent under a time budget', () => {
    const fixtures = [
      initialBitPosition(),
      parsePos(
        'W:Wa1,c1,e1,b2,f2,a3,c3,e3,g3,d4,h4:Bb6,d6,f6,h6,a7,c7,e7,b8,f8,h8,e5',
      ),
      parsePos('W:WKd4,Kg1,a3:BKh8,b6,c7'),
    ]
    for (const p of fixtures) {
      for (const budgetMs of [2, 4, 8, 16]) {
        ttClear()
        const r = search(p.white, p.black, p.kings, p.side, p.plies, {
          variant: CHECKERS,
          depth: 64,
          budgetMs,
          margin: 0,
        })
        expect(r.root[0]).toBe(r.m0)
        expect(r.root[1]).toBe(r.m1)
        expect(r.root[2]).toBe(r.score)
        expect(r.root[3]).toBe(EXACT)
        expect(legal(p).has(`${r.m0},${r.m1}`)).toBe(true)
      }
    }
  })

  it('clamps the depth to at least one', () => {
    const p = initialBitPosition()
    const shallow = run(p, 0)
    expect(shallow.depth).toBe(1)
    expect(legal(p).has(`${shallow.m0},${shallow.m1}`)).toBe(true)
  })

  it('plays a single legal move after one iteration under a time budget', () => {
    const p = parsePos('W:Wa1:Bh8')
    const timed = search(p.white, p.black, p.kings, p.side, p.plies, {
      variant: CHECKERS,
      depth: 64,
      budgetMs: 1000,
      margin: 0,
    })
    expect(timed.depth).toBe(1)
    expect(timed.root.length).toBe(ROOT_SLOTS)
    expect(bestMove(timed)).toBe(name('a1', 'b2'))
    // A fixed-depth request still gets its depth (tests, bench, sentinels).
    expect(run(p, 5).depth).toBe(5)
  })
})

describe('search: frozen scores', () => {
  // Regression sentinel at a fixed depth: change these numbers only on
  // purpose, when the tree rules or the evaluation change.
  it('returns the frozen depth-6 scores for the bench fixtures', () => {
    const at6 = (text: string): number => run(parsePos(text), 6).score
    expect(run(initialBitPosition(), 6).score).toBe(0)
    expect(
      at6(
        'W:Wa1,c1,e1,b2,f2,a3,c3,e3,g3,d4,h4:Bb6,d6,f6,h6,a7,c7,e7,b8,f8,h8,e5',
      ),
    ).toBe(18)
    expect(at6('W:WKd4,Kg1,a3:BKh8,b6,c7')).toBe(395)
    expect(at6('B:Wc3,e3,g3,d4,f4,b2,Kh2:Bd6,f6,c5,e5,g5,b6,Kb8')).toBe(193)
  })
})

describe('search: поддавки', () => {
  function giveaway(p: BitPosition, depth: number): SearchResult {
    return search(p.white, p.black, p.kings, p.side, p.plies, {
      variant: GIVEAWAY,
      depth,
      budgetMs: 0,
      margin: 0,
    })
  }

  /**
   * White's only move is a1-b2, Black's only reply is the capture back to
   * a1, and White then has nothing left to move. That is a loss at
   * checkers and a win at поддавки, and the two scores are the same
   * distance from mate because it is the same forced line.
   */
  const forced = parsePos('W:Wa1:Bc3')

  it('wins by running out of pieces', () => {
    ttClear()
    const r = giveaway(forced, 6)
    expect(r.score).toBe(MATE - 2)
    expect(bestMove(r)).toBe(name('a1', 'b2'))
  })

  it('reads the same position as a loss at checkers', () => {
    ttClear()
    expect(run(forced, 6).score).toBe(matedScore(2))
  })

  it('wins by having no move left', () => {
    ttClear()
    // Black to move with one man boxed in by its own side of the board:
    // a1 is blocked and there is nothing to capture, so Black wins at once.
    const r = giveaway(parsePos('B:Wc3,e3:Bb2'), 4)
    expect(r.root.length).toBeGreaterThan(0)
  })

  it('searches the same moves as checkers does', () => {
    const p = parsePos('W:Wc3,e3:Bd6,f6')
    ttClear()
    const a = giveaway(p, 4)
    ttClear()
    const b = run(p, 4)
    expect(a.root.length).toBe(b.root.length)
  })
})
