import { readFileSync, readdirSync } from 'node:fs'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { initialPosition as cornersOpening } from '../corners/board.ts'
import { formatCorners, parseCorners } from '../corners/position.ts'
import { ttClear as cornersTtClear } from '../corners/tt.ts'
import { fromBitPosition } from '../engine/adapter.ts'
import { DB_WIN, dbAddSlice, dbClear, dbPieces } from '../engine/db.ts'
import { moveKey } from '../engine/move.ts'
import { formatPos, initialBitPosition, parsePos } from '../engine/position.ts'
import { createRng } from '../engine/random.ts'
import { MATE, MATE_BOUND } from '../engine/score.ts'
import { ROOT_SLOTS, search } from '../engine/search.ts'
import { CHECKERS } from '../engine/variant.ts'
import { EXACT, ttClear } from '../engine/tt.ts'
import { legalMoves } from '../game/moves.ts'
import { formatMove } from '../game/notation.ts'
import { personaIds, personas } from './personas.ts'
import type { Persona } from './personas.ts'
import { pickRoot, think, thinkWith } from './think.ts'

/** Fixed depth, wide margin: deterministic and visibly random. */
const loose: Persona = {
  depth: 4,
  budgetMs: 0,
  margin: 150,
  temperature: 60,
  minThinkMs: 0,
  endgamePieces: 0,
}
const strict: Persona = { ...personas.owl, depth: 6, budgetMs: 0 }

const start = formatPos(initialBitPosition())

beforeEach(() => {
  ttClear()
})

describe('think', () => {
  it('answers the request id with a legal move and its search data', () => {
    const r = think({
      id: 7,
      variant: 'checkers',
      position: start,
      persona: 'hare',
      seed: 1,
    })
    expect(r.id).toBe(7)
    expect(r.depth).toBe(personas.hare.depth)
    expect(r.nodes).toBeGreaterThan(0)
    expect(r.ms).toBeGreaterThanOrEqual(0)
    const keys = legalMoves(fromBitPosition(parsePos(start)), 'checkers').map(
      moveKey,
    )
    expect(keys).toContain(moveKey(r.move))
  })

  it('stops early when the request caps the budget', () => {
    const deep: Persona = { ...personas.raven, depth: 64, budgetMs: 10_000 }
    const capped = thinkWith(
      {
        id: 1,
        variant: 'checkers',
        position: start,
        persona: 'raven',
        seed: 1,
        budgetMs: 1,
      },
      deep,
    )
    expect(capped.depth).toBeLessThan(deep.depth)
  })

  it('picks the same move for the same seed', () => {
    const a = thinkWith(
      {
        id: 1,
        variant: 'checkers',
        position: start,
        persona: 'hare',
        seed: 42,
      },
      loose,
    )
    ttClear()
    const b = thinkWith(
      {
        id: 2,
        variant: 'checkers',
        position: start,
        persona: 'hare',
        seed: 42,
      },
      loose,
    )
    expect(moveKey(b.move)).toBe(moveKey(a.move))
  })

  it('varies the move with the seed under a wide margin', () => {
    const seen = new Set<string>()
    for (let seed = 0; seed < 24; seed++) {
      ttClear()
      const r = thinkWith(
        {
          id: seed,
          variant: 'checkers',
          position: start,
          persona: 'hare',
          seed,
        },
        loose,
      )
      seen.add(moveKey(r.move))
    }
    expect(seen.size).toBeGreaterThan(1)
  })

  it('never picks outside the margin or an inexact score', () => {
    const p = parsePos(
      'W:Wa1,c1,e1,b2,f2,a3,c3,e3,g3,d4,h4:Bb6,d6,f6,h6,a7,c7,e7,b8,f8,h8,e5',
    )
    const r = search(p.white, p.black, p.kings, p.side, p.plies, {
      variant: CHECKERS,
      depth: 4,
      budgetMs: 0,
      margin: loose.margin,
    })
    const best = r.root[2]!
    for (let seed = 0; seed < 50; seed++) {
      const slot = pickRoot(
        r.root,
        loose.margin,
        loose.temperature,
        createRng(seed),
      )
      expect(slot % ROOT_SLOTS).toBe(0)
      expect(r.root[slot + 3]).toBe(EXACT)
      expect(r.root[slot + 2]).toBeGreaterThanOrEqual(best - loose.margin)
    }
  })

  it('lets the owl play the best move', () => {
    const p = parsePos('W:WKd4,Kg1,a3:BKh8,b6,c7')
    const expected = search(p.white, p.black, p.kings, p.side, p.plies, {
      variant: CHECKERS,
      depth: strict.depth,
      budgetMs: 0,
      margin: 0,
    }).score
    ttClear()
    const r = thinkWith(
      {
        id: 1,
        variant: 'checkers',
        position: formatPos(p),
        persona: 'owl',
        seed: 3,
      },
      strict,
    )
    expect(r.score).toBe(expected)
  })

  it('returns the full move when a man promotes in the middle of a capture', () => {
    // d6xe7 lands on f8 and promotes; the new king takes g7 and f4 and ends on c1.
    const p = parsePos('W:Wd6:Be7,g7,f4')
    const r = thinkWith(
      {
        id: 1,
        variant: 'checkers',
        position: formatPos(p),
        persona: 'owl',
        seed: 1,
      },
      strict,
    )
    expect(r.move.promotes).toBe(true)
    expect(r.move.captures.length).toBe(3)
    const keys = legalMoves(fromBitPosition(p), 'checkers').map(moveKey)
    expect(keys).toContain(moveKey(r.move))
  })

  it('refuses a position without moves', () => {
    expect(() =>
      thinkWith(
        {
          id: 1,
          variant: 'checkers',
          position: 'W:W:Bd4',
          persona: 'owl',
          seed: 1,
        },
        strict,
      ),
    ).toThrow(/decided position/)
  })

  it('refuses a position drawn by the 30-ply rule', () => {
    expect(() =>
      thinkWith(
        {
          id: 1,
          variant: 'checkers',
          position: 'W:WKa1:Bc3:30',
          persona: 'owl',
          seed: 1,
        },
        strict,
      ),
    ).toThrow(/drawn position/)
  })
})

describe('pickRoot', () => {
  it('chooses the only candidate without consulting the rng', () => {
    const root = Int32Array.from([1, 0, 50, EXACT, 2, 0, -300, EXACT])
    expect(pickRoot(root, 30, 15, () => 0.99)).toBe(0)
  })

  it('weights candidates by their distance to the best', () => {
    const root = Int32Array.from([
      1,
      0,
      0,
      EXACT,
      2,
      0,
      -60,
      EXACT,
      3,
      0,
      -60,
      3,
    ])
    const rng = createRng(5)
    let first = 0
    const total = 2000
    for (let i = 0; i < total; i++) {
      if (pickRoot(root, 150, 60, rng) === 0) first++
    }
    // Weights 1 and e^-1: the best is chosen about 73% of the time.
    expect(first / total).toBeGreaterThan(0.68)
    expect(first / total).toBeLessThan(0.78)
  })
})

describe('the endgame tables a persona may read', () => {
  /** Three kings against one: won, but too slowly for a short search. */
  const long = 'W:WKa1,Kb2,Kc3:BKf4:0'
  const taught: Persona = {
    ...personas.fox,
    depth: 4,
    budgetMs: 0,
    margin: 0,
    temperature: 0,
    minThinkMs: 0,
    endgamePieces: 5,
  }
  const untaught: Persona = { ...taught, endgamePieces: 0 }

  function score(persona: Persona): number {
    return thinkWith(
      { id: 1, variant: 'checkers', position: long, persona: 'fox', seed: 1 },
      persona,
    ).score
  }

  afterAll(() => {
    dbClear()
  })

  it('decides the ending for one and not the other', () => {
    dbClear()
    for (const name of readdirSync('public/db/')) {
      if (name.endsWith('.bin')) dbAddSlice(readFileSync(`public/db/${name}`))
    }
    // The win needs more plies than this search looks, so only the tables
    // can find it.
    expect(score(taught)).toBeGreaterThan(DB_WIN - 64)
    expect(score(untaught)).toBeLessThan(DB_WIN - 64)
  })
})

describe('think: поддавки', () => {
  /** Shallow, so the whole ladder answers inside one test. */
  const quick = { depth: 4, budgetMs: 0, minThinkMs: 0 }

  it('answers with a legal move for every persona', () => {
    const legal = legalMoves(
      fromBitPosition(initialBitPosition()),
      'checkers',
    ).map(moveKey)
    for (const id of personaIds) {
      const r = thinkWith(
        { id: 1, variant: 'giveaway', position: start, persona: id, seed: 3 },
        { ...personas[id], ...quick },
      )
      expect(legal).toContain(moveKey(r.move))
    }
  })

  it('looks nothing up in the endgame tables', () => {
    // They hold checkers win and loss values, which are not this game's,
    // so the personas allowed to read them must be refused here.
    dbClear()
    for (const name of readdirSync('public/db/')) {
      if (name.endsWith('.bin')) dbAddSlice(readFileSync(`public/db/${name}`))
    }
    const position = 'W:WKa1,c3:BKh8'
    for (const id of ['fox', 'owl', 'raven'] as const) {
      const request = { id: 1, position, persona: id, seed: 1 }
      thinkWith(
        { ...request, variant: 'giveaway' },
        { ...personas[id], ...quick },
      )
      expect(dbPieces()).toBe(0)
      // The same persona on the same board does read them at checkers, so
      // the zero above is this game's doing and not an empty table.
      thinkWith(
        { ...request, variant: 'checkers' },
        { ...personas[id], ...quick },
      )
      expect(dbPieces()).toBeGreaterThan(0)
    }
    dbClear()
  })

  it('plays the winning move where checkers would call it a loss', () => {
    // a1-b2 forces the capture that leaves White with nothing to move,
    // which is how поддавки is won. The score says so: a win, not a loss.
    const request = {
      id: 1,
      position: 'W:Wa1:Bc3',
      persona: 'raven',
      seed: 1,
    } as const
    const won = thinkWith(
      { ...request, variant: 'giveaway' },
      { ...personas.raven, ...quick, depth: 6 },
    )
    expect(formatMove(won.move)).toBe('a1-b2')
    expect(won.score).toBeGreaterThan(MATE_BOUND)

    const lost = thinkWith(
      { ...request, variant: 'checkers' },
      { ...personas.raven, ...quick, depth: 6 },
    )
    expect(lost.score).toBeLessThan(-MATE_BOUND)
  })
})

describe('think: уголки', () => {
  beforeEach(() => {
    cornersTtClear()
  })

  it('answers with a legal уголки move and the persona depth', () => {
    const start = cornersOpening()
    const r = think({
      id: 3,
      variant: 'corners',
      position: formatCorners(start),
      persona: 'hare',
      seed: 1,
    })
    expect(r.id).toBe(3)
    expect(r.depth).toBe(personas.hare.depth)
    const keys = legalMoves(start, 'corners').map(moveKey)
    expect(keys).toContain(moveKey(r.move))
  })

  it('returns a chain as the UI move, path and all', () => {
    // Two black men to jump over on the way up the a-file; the third keeps
    // Black from being about to finish, so nothing needs blocking.
    const r = thinkWith(
      {
        id: 1,
        variant: 'corners',
        position: 'W:Wa1:Ba2,a4,h8',
        persona: 'owl',
        seed: 1,
      },
      strict,
    )
    expect(formatMove(r.move)).toBe('a1-a3-a5')
    expect(r.move.captures).toEqual([])
  })

  it('refuses a finished race', () => {
    expect(() =>
      thinkWith(
        {
          id: 1,
          variant: 'corners',
          position: 'W:Wf6,g6,h6,f7,g7,h7,f8,g8,h8:Ba1,b1,c1,a2,b2,c2,a3,b3,c3',
          persona: 'owl',
          seed: 1,
        },
        strict,
      ),
    ).toThrow(/drawn position/)
  })

  it('reads the ply count off the literal', () => {
    // At ply 78 the man at home must leave before the deadline two plies on.
    const r = thinkWith(
      {
        id: 1,
        variant: 'corners',
        position: 'W:Wc3,e5:Bd5,d6:78',
        persona: 'owl',
        seed: 1,
      },
      strict,
    )
    expect(r.move.from).toBe(parseCorners('W:Wc3:B').board.findIndex(Boolean))
  })
})

describe('pickRoot: a win found', () => {
  it('is played the shortest way whatever the margin', () => {
    // Two exact wins, in three moves and in four: the kitten would take
    // either at its margin, and might keep taking the longer one.
    const root = Int32Array.from([1, 0, MATE - 6, EXACT, 2, 0, MATE - 8, EXACT])
    expect(pickRoot(root, 400, 250, () => 0.99)).toBe(0)
  })

  it('holds the longest defence in a lost position', () => {
    const root = Int32Array.from([
      1,
      0,
      -(MATE - 8),
      EXACT,
      2,
      0,
      -(MATE - 6),
      EXACT,
    ])
    expect(pickRoot(root, 400, 250, () => 0.99)).toBe(0)
  })
})
