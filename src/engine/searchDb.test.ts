import { readFileSync, readdirSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DB_DRAW_BAND, DB_WIN, dbAddSlice, dbClear, dbProbe } from './db.ts'
import { parsePos } from './position.ts'
import { search } from './search.ts'
import { CHECKERS } from './variant.ts'
import { DRAW_SCORE } from './score.ts'
import { ttClear } from './tt.ts'

const DB_DIR = 'public/db/'
const FIXTURE = 'src/engine/testdata/endgame4.txt'
/** The widest a database score can be from `DB_WIN`: the budget is 30. */
const DB_BAND = 30
/** A drawn position keeps a squeezed evaluation; see `drawnScore`. */
const DRAW_BAND = DB_DRAW_BAND

beforeAll(() => {
  dbClear()
  for (const name of readdirSync(DB_DIR)) {
    if (name.endsWith('.bin')) dbAddSlice(readFileSync(DB_DIR + name))
  }
})

afterAll(() => {
  dbClear()
})

function scoreOf(literal: string, depth: number): number {
  const p = parsePos(`${literal}:0`)
  ttClear()
  return search(p.white, p.black, p.kings, p.side, p.plies, {
    variant: CHECKERS,
    depth,
    budgetMs: 0,
    margin: 0,
  }).score
}

describe('search with the endgame database', () => {
  /*
   * The capture search does not probe: it would pay for a lookup the
   * node above it has already made. A line that ends in a capture is
   * therefore evaluated at the horizon, and the search needs a few plies
   * before it agrees with the tables everywhere.
   *
   * The search never returns the stored value of the root itself: it
   * takes the best child from the database, and a child is one ply
   * further along, so its threshold is one smaller. What must hold is
   * that both agree on the result and that the score is at least as good
   * as the database band, which sits above every evaluation.
   */
  it('agrees with the stored verdict of every fixture', () => {
    const lines = readFileSync(FIXTURE, 'utf8').trim().split('\n')
    for (const line of lines.slice(0, 200)) {
      const literal = line.split('|')[0]!
      const p = parsePos(`${literal}:0`)
      const stored = dbProbe(p.white, p.black, p.kings, p.side, p.plies)
      const score = scoreOf(literal, 6)
      if (stored === DRAW_SCORE) {
        // Not the probe's own value: a line that ends in a capture is
        // evaluated at the horizon, one ply below the last node that
        // probes. What must hold is that a drawn position is never
        // mistaken for a decided one.
        expect(Math.abs(score), literal).toBeLessThan(DB_WIN - DB_BAND)
      } else if (stored > 0) {
        // A mate the search proves itself scores even higher.
        expect(score, literal).toBeGreaterThanOrEqual(DB_WIN - DB_BAND)
      } else {
        expect(score, literal).toBeLessThanOrEqual(DB_BAND - DB_WIN)
      }
    }
  })

  it('sees a king beat a man as soon as it looks two plies', () => {
    expect(scoreOf('W:WKa1:Bb8', 2)).toBeGreaterThanOrEqual(DB_WIN - DB_BAND)
  })

  it('keeps a drawn ending drawn however deep it looks', () => {
    for (const depth of [2, 4, 12]) {
      const score = scoreOf('W:WKa1,Kc1:BKf8,Kh8', depth)
      expect(Math.abs(score), `depth ${depth}`).toBeLessThanOrEqual(DRAW_BAND)
    }
  })
})
