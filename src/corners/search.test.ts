import { beforeEach, describe, expect, it } from 'vitest'
import { squareFromName, squareName } from '../game/board.ts'
import { applyMove } from '../game/apply.ts'
import { ROOT_SLOTS } from '../engine/search.ts'
import { DRAW_SCORE, MATE, MATE_BOUND } from '../engine/score.ts'
import { EXACT, UPPER } from '../engine/tt.ts'
import type { Position } from '../game/types.ts'
import { moveFrom, moveTo } from './apply.ts'
import { initialPosition } from './board.ts'
import { generateDetailed } from './movegen.ts'
import { parseCorners } from './position.ts'
import { search, searchStats } from './search.ts'
import type { SearchResult } from './search.ts'
import { HOME_PLIES } from './status.ts'
import { ttClear } from './tt.ts'

const sq = squareFromName

function run(position: Position, depth: number, margin = 0): SearchResult {
  return search(position, { depth, budgetMs: 0, margin })
}

function best(r: SearchResult): string {
  return `${squareName(moveFrom(r.move))}-${squareName(moveTo(r.move))}`
}

beforeEach(() => {
  ttClear()
})

describe('search', () => {
  it('plays the finishing move', () => {
    // White's last man steps into the target. Black gets its answer and
    // cannot finish with it, so the win is two plies on.
    const p = parseCorners(
      'W:Wf6,g6,h6,f7,g7,h7,g8,h8,e8:Bd4,d5,d6,e4,e5,e6,a1,b1,c1',
    )
    const r = run(p, 3)
    expect(best(r)).toBe('e8-f8')
    expect(r.score).toBe(MATE - 2)
  })

  it('sees a finish through a jump chain', () => {
    // a1 → a3 → a5 → c5 → e5 → g5 → g7: one leap, and the last man is home.
    const p = parseCorners('W:Wa1,f6,g6,h6,f7,h7,f8,g8,h8:Ba2,a4,b5,d5,f5')
    const r = run(p, 3)
    expect(best(r)).toBe('a1-g7')
    expect(r.score).toBe(MATE - 2)
  })

  it('knows a finish Black can answer is only a draw', () => {
    // White finishes now and Black finishes with the answer: a draw. Any
    // other move lets Black finish first and win, so the draw is the best
    // there is, and the search must not score the finish as a win.
    const p = parseCorners(
      'W:Wf6,g6,h6,f7,g7,h7,g8,h8,e8:Ba1,b1,c1,a2,b2,c2,a3,b3,d3',
    )
    const r = run(p, 4)
    expect(best(r)).toBe('e8-f8')
    expect(r.score).toBe(DRAW_SCORE)
  })

  it('answers a finished position with no move', () => {
    const done = parseCorners(
      'W:Wf6,g6,h6,f7,g7,h7,f8,g8,h8:Ba1,b1,c1,a2,b2,c2,a3,b3,c3',
    )
    const r = run(done, 3)
    expect(r.root).toHaveLength(0)
    expect(r.score).toBe(DRAW_SCORE)
  })

  it('reports a lost position from the side to move', () => {
    const stuck = parseCorners('W:Wb7:Bb8,a7,c7,b6,d7,b5')
    const r = run(stuck, 3)
    expect(r.root).toHaveLength(0)
    expect(r.score).toBe(-MATE)
  })

  it('leaves home before the deadline', () => {
    // Two plies to go before a man at home loses; the man at home has to
    // go, whatever the distance says.
    const p = parseCorners(`W:Wc3,e5:Bd5,d6:${HOME_PLIES - 2}`)
    const r = run(p, 4)
    expect(moveFrom(r.move)).toBe(sq('c3'))
    expect([sq('d3'), sq('c4')]).toContain(moveTo(r.move))
    expect(r.score).toBeGreaterThan(-MATE_BOUND)
  })

  it('knows a man that cannot leave home in time is lost', () => {
    // a1 is walled in by its own home: one move cannot get it out.
    const p = parseCorners(`W:Wa1,e5:Bd5,d6:${HOME_PLIES - 2}`)
    const r = run(p, 4)
    expect(r.score).toBe(-(MATE - 2))
  })

  it('gives exact scores within the margin and bounds beyond it', () => {
    const r = run(initialPosition(), 3, 0)
    const flags = new Set<number>()
    for (let slot = 0; slot < r.root.length; slot += ROOT_SLOTS) {
      flags.add(r.root[slot + 3]!)
      expect(r.root[slot + 1]).toBe(0)
    }
    expect(flags.has(EXACT)).toBe(true)
    expect(flags.has(UPPER)).toBe(true)
    expect(r.root[3]).toBe(EXACT)
    for (let slot = ROOT_SLOTS; slot < r.root.length; slot += ROOT_SLOTS) {
      expect(r.root[slot + 2]).toBeLessThanOrEqual(
        r.root[slot - ROOT_SLOTS + 2]!,
      )
    }
  })

  it('returns legal moves in the root, best first', () => {
    const p = initialPosition()
    const r = run(p, 4)
    const legal = new Set(generateDetailed(p).map((m) => `${m.from}-${m.to}`))
    expect(r.root.length / ROOT_SLOTS).toBe(legal.size)
    for (let slot = 0; slot < r.root.length; slot += ROOT_SLOTS) {
      const m = r.root[slot]!
      expect(legal.has(`${moveFrom(m)}-${moveTo(m)}`)).toBe(true)
    }
    expect(r.depth).toBe(4)
    expect(r.nodes).toBeGreaterThan(0)
    expect(searchStats().nodes).toBe(r.nodes)
  })

  it('is deterministic at a fixed depth and consistent with itself', () => {
    const p = initialPosition()
    const a = run(p, 5)
    ttClear()
    const b = run(p, 5)
    expect(a.move).toBe(b.move)
    expect(a.score).toBe(b.score)
  })

  it('stops within its time budget', () => {
    const r = search(initialPosition(), { depth: 64, budgetMs: 30, margin: 0 })
    expect(r.depth).toBeGreaterThanOrEqual(1)
    expect(r.depth).toBeLessThan(64)
  })

  it('plays a whole game against itself and finishes it', () => {
    let position = initialPosition()
    for (let ply = 0; ply < 200; ply++) {
      const r = search(position, { depth: 4, budgetMs: 0, margin: 0 })
      if (r.root.length === 0) break
      const from = moveFrom(r.move)
      const to = moveTo(r.move)
      const move = generateDetailed(position).find(
        (m) => m.from === from && m.to === to,
      )
      expect(move).toBeDefined()
      position = applyMove(position, move!)
    }
    expect(position.ply).toBeLessThan(200)
  })
})
