import { readFileSync, readdirSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  DB_UNKNOWN,
  DB_WIN,
  dbAddSlice,
  dbClear,
  dbLimit,
  dbPieces,
  dbProbe,
} from './db.ts'
import { EVAL_MAX } from './eval.ts'
import {
  BLACK,
  WHITE,
  initialBitPosition,
  mirror,
  parsePos,
} from './position.ts'
import { search } from './search.ts'
import { ttClear } from './tt.ts'
import { DRAW_SCORE, MATE_BOUND } from './score.ts'
import { DRAW_PLIES } from './status.ts'

/* Vitest runs from the project root. */
const DB_DIR = 'public/db/'
/** Positions dumped by `dbgen -dump`, four and five pieces. */
const FIXTURES = [
  'src/engine/testdata/endgame4.txt',
  'src/engine/testdata/endgame5.txt',
]

/** `W:...|win3` from `dbgen -dump`: the position and its stored value. */
type Case = { literal: string; win: boolean; loss: boolean; threshold: number }

function fixtures(path: string): Case[] {
  return readFileSync(path, 'utf8')
    .trim()
    .split('\n')
    .map((line) => {
      const [literal, verdict] = line.split('|') as [string, string]
      const win = verdict.startsWith('win')
      const loss = verdict.startsWith('loss')
      const threshold = Number(verdict.replace(/[a-z]/g, '')) || 0
      return { literal, win, loss, threshold }
    })
}

beforeAll(() => {
  dbClear()
  for (const name of readdirSync(DB_DIR)) {
    if (name.endsWith('.bin')) dbAddSlice(readFileSync(DB_DIR + name))
  }
})

describe('endgame database', () => {
  it('scores below mate and above every evaluation', () => {
    expect(DB_WIN).toBeGreaterThan(EVAL_MAX)
    expect(DB_WIN).toBeLessThan(MATE_BOUND)
  })

  it('loads every table that is shipped', () => {
    expect(dbPieces()).toBe(5)
  })

  it('does not answer for positions outside the tables', () => {
    const p = initialBitPosition()
    expect(dbProbe(p.white, p.black, p.kings, p.side, p.plies)).toBe(DB_UNKNOWN)
  })

  it.each(FIXTURES)('agrees with the generator on %s', (path) => {
    for (const c of fixtures(path)) {
      const p = parsePos(`${c.literal}:0`)
      const score = dbProbe(p.white, p.black, p.kings, p.side, p.plies)
      const want = c.win
        ? DB_WIN - c.threshold
        : c.loss
          ? c.threshold - DB_WIN
          : DRAW_SCORE
      expect(score, c.literal).toBe(want)
    }
  })

  it.each(FIXTURES)(
    'answers a mirrored position of %s the same way',
    (path) => {
      for (const c of fixtures(path)) {
        const p = parsePos(`${c.literal}:0`)
        const m = mirror(p)
        expect(m.side).toBe(BLACK)
        expect(
          dbProbe(m.white, m.black, m.kings, m.side, m.plies),
          c.literal,
        ).toBe(dbProbe(p.white, p.black, p.kings, p.side, p.plies))
      }
    },
  )

  it.each(FIXTURES)('draws %s once the counter is too far along', (path) => {
    let checked = 0
    for (const c of fixtures(path)) {
      if (!c.win && !c.loss) continue
      const decided = parsePos(`${c.literal}:${DRAW_PLIES - c.threshold}`)
      const tooLate = parsePos(`${c.literal}:${DRAW_PLIES - c.threshold + 1}`)
      expect(
        dbProbe(
          decided.white,
          decided.black,
          decided.kings,
          WHITE,
          decided.plies,
        ),
        c.literal,
      ).not.toBe(DRAW_SCORE)
      expect(
        dbProbe(
          tooLate.white,
          tooLate.black,
          tooLate.kings,
          WHITE,
          tooLate.plies,
        ),
        c.literal,
      ).toBe(DRAW_SCORE)
      checked++
    }
    expect(checked).toBeGreaterThan(100)
  })
})

describe('a damaged table', () => {
  it('is dropped instead of throwing out of the search', () => {
    dbClear()
    const bytes = readFileSync(`${DB_DIR}0m1kv0m1k.bin`)
    // Blocks are raw deflate; flipping bytes inside one makes it unreadable.
    const damaged = new Uint8Array(bytes)
    damaged.fill(0xff, damaged.length - 16)
    dbAddSlice(damaged)
    expect(dbPieces()).toBe(2)
    const p = parsePos('W:WKa1:BKh8:0')
    expect(dbProbe(p.white, p.black, p.kings, p.side, p.plies)).toBe(DB_UNKNOWN)
    expect(dbPieces()).toBe(0)
  })
})

describe('when the tables arrive mid-game', () => {
  /** Six pieces, and the win is beyond a six-ply search without them. */
  const literal = 'B:Wf2,d4,g5:Bb2,d2,c7:0'
  const limits = { depth: 6, budgetMs: 0, margin: 0 }

  it('the search stops believing what it worked out without them', () => {
    dbClear()
    ttClear()
    const p = parsePos(literal)
    const before = search(p.white, p.black, p.kings, p.side, p.plies, limits)
    expect(Math.abs(before.score)).toBeLessThan(DB_WIN - DRAW_PLIES)

    // No `ttClear` here: loading a slice has to invalidate the scores the
    // search reached without it, or the game plays on the old ones.
    for (const name of readdirSync(DB_DIR)) {
      if (name.endsWith('.bin')) dbAddSlice(readFileSync(DB_DIR + name))
    }
    const after = search(p.white, p.black, p.kings, p.side, p.plies, limits)
    expect(after.score).toBeGreaterThanOrEqual(DB_WIN - DRAW_PLIES)
  })

  it('and stops believing them when a persona may not read them', () => {
    const p = parsePos(literal)
    dbLimit(0)
    const blind = search(p.white, p.black, p.kings, p.side, p.plies, limits)
    expect(Math.abs(blind.score)).toBeLessThan(DB_WIN - DRAW_PLIES)
    dbLimit(5)
    const seeing = search(p.white, p.black, p.kings, p.side, p.plies, limits)
    expect(seeing.score).toBeGreaterThanOrEqual(DB_WIN - DRAW_PLIES)
  })
})

describe('a block that inflates short', () => {
  it('is refused rather than read as a run of draws', () => {
    dbClear()
    const bytes = new Uint8Array(readFileSync(`${DB_DIR}0m1kv0m1k.bin`))
    const view = new DataView(bytes.buffer)
    const blocks = view.getUint32(16, true)
    const data = 20 + (blocks + 1) * 4
    // An empty final stored block: the same length, valid deflate, and
    // nothing in it. Without a length check it reads back as all draws.
    bytes.set([0x01, 0x00, 0x00, 0xff, 0xff], data)
    dbAddSlice(bytes)
    const p = parsePos('W:WKa1:BKh8:0')
    expect(dbProbe(p.white, p.black, p.kings, p.side, p.plies)).toBe(DB_UNKNOWN)
  })
})
