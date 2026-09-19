/* v8 ignore file */
/**
 * Engine benchmarks. Bundled with rolldown and run by plain node
 * (`npm run bench`), so the code is measured the way a browser runs it:
 * one module scope, helpers inlined by V8. Under vitest every import is a
 * tracked getter, which makes the same code 5–20x slower; do not compare
 * numbers from the two setups. Results live in docs/engine-bench.md.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { fromBitPosition } from './adapter.ts'
import { APPLIED, makeMove } from './apply.ts'
import { RANK_1, lsb, popcount, reverse32 } from './bitboard.ts'
import {
  BACK_RANK_GUARD,
  KING_TABLE,
  MAN_TABLE,
  TEMPO,
  evaluate,
  pieceSquareSum,
} from './eval.ts'
import { MAX_MOVES, MOVE_SLOTS, generate, generateDetailed } from './movegen.ts'
import { perft } from './perft.ts'
import { WHITE, initialBitPosition, parsePos } from './position.ts'
import type { BitPosition } from './position.ts'
import { dbAddSlice, dbClear, dbPieces, dbProbe, dbStats } from './db.ts'
import { createRng, randomPlacement, randomWalk } from './random.ts'
import { mailboxMoves, mailboxPerft } from './reference/mailbox.ts'
import { search, searchStats } from './search.ts'
import type { Limits } from './search.ts'
import { CHECKERS, GIVEAWAY } from './variant.ts'
import { ttClear } from './tt.ts'
import {
  BLACK as CORNERS_BLACK,
  WHITE as CORNERS_WHITE,
  initialPosition as cornersOpening,
  load as loadCorners,
} from '../corners/board.ts'
import { evaluate as evaluateCorners } from '../corners/eval.ts'
import {
  MAX_MOVES as CORNERS_MAX_MOVES,
  generate as generateCorners,
} from '../corners/movegen.ts'
import { randomWalk as cornersWalk } from '../corners/random.ts'
import {
  search as searchCorners,
  searchStats as cornersStats,
} from '../corners/search.ts'
import { statusOf as cornersStatusOf } from '../corners/status.ts'
import { ttClear as cornersTtClear } from '../corners/tt.ts'
import type { Position } from '../game/types.ts'

const WARMUP_MS = 300
const SAMPLE_MS = 150
const SAMPLES = 9

type Result = {
  readonly name: string
  readonly nsPerOp: number
  readonly spread: number
}

/**
 * Median ns per operation over `SAMPLES` timed windows after a warm-up;
 * `opsPerCall` is how many operations one `fn()` performs.
 */
function measure(name: string, fn: () => void, opsPerCall = 1): Result {
  const warmupEnd = performance.now() + WARMUP_MS
  while (performance.now() < warmupEnd) fn()
  const times: number[] = []
  for (let s = 0; s < SAMPLES; s++) {
    let calls = 0
    const start = performance.now()
    let end = start
    do {
      for (let i = 0; i < 8; i++) fn()
      calls += 8
      end = performance.now()
    } while (end - start < SAMPLE_MS)
    times.push(((end - start) * 1e6) / (calls * opsPerCall))
  }
  times.sort((a, b) => a - b)
  const median = times[(SAMPLES - 1) >> 1]!
  const spread = (times[SAMPLES - 1]! - times[0]!) / median
  return { name, nsPerOp: median, spread }
}

function format(n: number): string {
  if (n >= 100) return n.toFixed(0)
  if (n >= 10) return n.toFixed(1)
  return n.toFixed(2)
}

function report(title: string, unit: string, results: Result[]): void {
  console.log(`\n## ${title}\n`)
  console.log(`| benchmark | ns/${unit} | M${unit}/s | spread |`)
  console.log('| --- | ---: | ---: | ---: |')
  for (const r of results) {
    const perSec = format(1000 / r.nsPerOp)
    const spread = `±${(r.spread * 50).toFixed(1)}%`
    console.log(`| ${r.name} | ${format(r.nsPerOp)} | ${perSec} | ${spread} |`)
  }
}

const FIXTURES: Record<string, BitPosition> = {
  initial: initialBitPosition(),
  midgame: parsePos(
    'W:Wa1,c1,e1,b2,f2,a3,c3,e3,g3,d4,h4:Bb6,d6,f6,h6,a7,c7,e7,b8,f8,h8,e5',
  ),
  kings: parsePos('W:WKd4,Kg1,a3:BKh8,b6,c7'),
  tactics: parsePos('B:Wc3,e3,g3,d4,f4,b2,Kh2:Bd6,f6,c5,e5,g5,b6,Kb8'),
}

/**
 * The search bench swaps the kings fixture: the engine one has a single
 * legal move (a forced capture), which a timed search plays after one
 * iteration, so it would measure nothing. This one has 13 quiet moves.
 */
const SEARCH_FIXTURES: Record<string, BitPosition> = {
  ...FIXTURES,
  kings: parsePos('W:WKd4,Kg1,a3:BKh8,b6,a7'),
}

const OUT = new Int32Array(MAX_MOVES * MOVE_SLOTS)
let sink = 0

function benchGenerate(): void {
  const results: Result[] = []
  for (const [name, p] of Object.entries(FIXTURES)) {
    const position = fromBitPosition(p)
    results.push(
      measure(`bitboard ${name}`, () => {
        sink ^= generate(p.white, p.black, p.kings, p.side, OUT, 0)
      }),
      measure(`detailed ${name}`, () => {
        sink ^= generateDetailed(p).length
      }),
      measure(`mailbox ${name}`, () => {
        sink ^= mailboxMoves(position).length
      }),
    )
  }

  const rng = createRng(42)
  const walk = randomWalk(rng, 200)
  const placements: BitPosition[] = []
  while (placements.length < 200) placements.push(randomPlacement(rng))
  const walk64 = walk.map(fromBitPosition)
  const placements64 = placements.map(fromBitPosition)
  const all = (positions: BitPosition[]): void => {
    for (const p of positions) {
      sink ^= generate(p.white, p.black, p.kings, p.side, OUT, 0)
    }
  }
  results.push(
    measure(
      `bitboard random game (${walk.length})`,
      () => all(walk),
      walk.length,
    ),
    measure(
      `mailbox random game (${walk.length})`,
      () => {
        for (const p of walk64) sink ^= mailboxMoves(p).length
      },
      walk.length,
    ),
    measure('bitboard random placements (200)', () => all(placements), 200),
    measure(
      'mailbox random placements (200)',
      () => {
        for (const p of placements64) sink ^= mailboxMoves(p).length
      },
      200,
    ),
  )
  report('generate: one position', 'pos', results)
}

function benchMakeMove(): void {
  const p = FIXTURES['midgame']!
  const count = generate(p.white, p.black, p.kings, p.side, OUT, 0)
  // 64 rounds per call so the clock reads do not dominate a 1–2 ns op.
  const rounds = 64
  const result = measure(
    `makeMove (${count} moves of the midgame position)`,
    () => {
      for (let r = 0; r < rounds; r++) {
        for (let i = 0; i < count * MOVE_SLOTS; i += MOVE_SLOTS) {
          makeMove(p.white, p.black, p.kings, p.side, 0, OUT[i]!, OUT[i + 1]!)
          sink ^= APPLIED[0]!
        }
      }
    },
    count * rounds,
  )
  report('makeMove', 'move', [result])
}

function benchPerft(): void {
  const p = initialBitPosition()
  const position = fromBitPosition(p)
  // Leaves are counted without being generated, so a "node" here is one
  // generate + makeMove; the mailbox row uses the same leaf count.
  const leaves = [7482, 37986, 190146]
  const nodes = [1828, 9310, 47296]
  const results: Result[] = []
  for (const [i, depth] of [5, 6, 7].entries()) {
    results.push(
      measure(
        `bitboard perft ${depth} (${leaves[i]} leaves, ${nodes[i]} nodes)`,
        () => {
          sink ^= perft(p.white, p.black, p.kings, p.side, depth)
        },
        leaves[i]!,
      ),
    )
  }
  results.push(
    measure(
      'mailbox perft 5 (7482 leaves)',
      () => {
        sink ^= mailboxPerft(position, 5)
      },
      7482,
    ),
  )
  report('perft from the initial position', 'leaf', results)
}

/*
 * V8 call boundary: an int32 argument outside the 31-bit Smi range must be
 * boxed as a HeapNumber when the callee is not inlined. `mix` is too large
 * to inline; the two runs differ only in the argument values.
 */
function mix(a: number, b: number, c: number): number {
  let x = a ^ b
  for (let round = 0; round < 3; round++) {
    x = Math.imul(x, 0x9e3779b1) ^ c
    x = (x << 5) | (x >>> 27)
    x = Math.imul(x ^ a, 0x85ebca6b)
    x = (x << 13) | (x >>> 19)
    x = Math.imul(x ^ b, 0xc2b2ae35)
    x = (x << 7) | (x >>> 25)
    x = Math.imul(x ^ c, 0x27d4eb2f)
    x = (x << 11) | (x >>> 21)
    x = Math.imul(x ^ a, 0x165667b1)
    x = (x << 3) | (x >>> 29)
    x = Math.imul(x ^ b, 0xd3a2646c)
    x = (x << 17) | (x >>> 15)
    x = Math.imul(x ^ c, 0xfd7046c5)
    x = (x << 9) | (x >>> 23)
    x = Math.imul(x ^ a, 0xb55a4f09)
    x = (x << 15) | (x >>> 17)
    x = Math.imul(x ^ b, 0x9e3779b1)
    x = (x << 21) | (x >>> 11)
    x = Math.imul(x ^ c, 0x85ebca6b)
    x = (x << 19) | (x >>> 13)
    x = Math.imul(x ^ a, 0xc2b2ae35)
    x = (x << 25) | (x >>> 7)
    x = Math.imul(x ^ b, 0x27d4eb2f)
    x = (x << 23) | (x >>> 9)
    x = Math.imul(x ^ c, 0x165667b1)
    x = (x << 27) | (x >>> 5)
    x = Math.imul(x ^ a, 0xd3a2646c)
    x = (x << 29) | (x >>> 3)
    x = Math.imul(x ^ b, 0xfd7046c5)
    x = (x << 31) | (x >>> 1)
    x = Math.imul(x ^ c, 0xb55a4f09)
  }
  return x
}

function benchCallBoundary(): void {
  const smi = new Int32Array([0x00000fff, 0x3ffff000, 0x0000f0f0])
  const heap = new Int32Array([0x40000fff, 0x80000000 | 0, 0x7ffff0f0])
  const run = (args: Int32Array): void => {
    const a = args[0]!
    const b = args[1]!
    const c = args[2]!
    for (let i = 0; i < 1000; i++) sink ^= mix(a ^ (i & 1), b, c)
  }
  report('call boundary: int32 arguments (1000 calls)', 'call', [
    measure('Smi range', () => run(smi), 1000),
    measure('HeapNumber range', () => run(heap), 1000),
  ])
}

const LUT = new Uint8Array(65536)
for (let i = 0; i < 65536; i++) LUT[i] = popcount(i)
function popcountLut(b: number): number {
  return LUT[b & 0xffff]! + LUT[b >>> 16]!
}

function benchPopcount(): void {
  const rng = createRng(3)
  const values = new Int32Array(1024)
  for (let i = 0; i < 1024; i++) values[i] = (rng() * 4294967296) | 0
  report('popcount (1024 values)', 'op', [
    measure(
      'SWAR',
      () => {
        for (let i = 0; i < 1024; i++) sink ^= popcount(values[i]!)
      },
      1024,
    ),
    measure(
      '16-bit table',
      () => {
        for (let i = 0; i < 1024; i++) sink ^= popcountLut(values[i]!)
      },
      1024,
    ),
  ])
}

/*
 * Evaluation: the shipped two-lookup form against the other ways of summing
 * a piece-square table over a bitboard. Every variant computes the whole
 * evaluation (guard and tempo included) on the same 1024 random placements,
 * so only the sum differs. The small tables stay in L1; the 1 MB tables of
 * the shipped form do not, which the search bench will weigh again with a
 * transposition table thrashing the cache.
 */
function quarter(table: Int32Array, offset: number): Int32Array {
  const lut = new Int32Array(256)
  for (let v = 1; v < 256; v++) {
    lut[v] = lut[v & (v - 1)]! + table[offset + lsb(v)]!
  }
  return lut
}
const M0 = quarter(MAN_TABLE, 0)
const M1 = quarter(MAN_TABLE, 8)
const M2 = quarter(MAN_TABLE, 16)
const M3 = quarter(MAN_TABLE, 24)
const K0 = quarter(KING_TABLE, 0)
const K1 = quarter(KING_TABLE, 8)
const K2 = quarter(KING_TABLE, 16)
const K3 = quarter(KING_TABLE, 24)

function sumMen8(b: number): number {
  return (
    M0[b & 0xff]! +
    M1[(b >>> 8) & 0xff]! +
    M2[(b >>> 16) & 0xff]! +
    M3[b >>> 24]!
  )
}

function sumKings8(b: number): number {
  return (
    K0[b & 0xff]! +
    K1[(b >>> 8) & 0xff]! +
    K2[(b >>> 16) & 0xff]! +
    K3[b >>> 24]!
  )
}

/** One mask per distinct table value, for the popcount form. */
function classes(table: Int32Array): { masks: Int32Array; values: Int32Array } {
  const byValue = new Map<number, number>()
  for (let sq = 0; sq < 32; sq++) {
    const v = table[sq]!
    byValue.set(v, (byValue.get(v) ?? 0) | (1 << sq))
  }
  return {
    masks: Int32Array.from(byValue.values()),
    values: Int32Array.from(byValue.keys()),
  }
}
const MAN_CLASSES = classes(MAN_TABLE)
const KING_CLASSES = classes(KING_TABLE)

function sumClasses(b: number, masks: Int32Array, values: Int32Array): number {
  let sum = 0
  for (let i = 0; i < masks.length; i++) {
    sum += popcount(b & masks[i]!) * values[i]!
  }
  return sum
}

function finish(
  score: number,
  whiteMen: number,
  blackMen: number,
  side: number,
): number {
  if (blackMen !== 0) score += popcount(whiteMen & RANK_1) * BACK_RANK_GUARD
  if (whiteMen !== 0) score -= popcount(blackMen & RANK_1) * BACK_RANK_GUARD
  return (side === WHITE ? score : -score) + TEMPO
}

function evaluate8(
  white: number,
  black: number,
  kings: number,
  side: number,
): number {
  const whiteMen = white & ~kings
  const blackMen = reverse32(black & ~kings)
  const score =
    sumMen8(whiteMen) +
    sumKings8(white & kings) -
    sumMen8(blackMen) -
    sumKings8(reverse32(black & kings))
  return finish(score, whiteMen, blackMen, side)
}

function evaluateClasses(
  white: number,
  black: number,
  kings: number,
  side: number,
): number {
  const whiteMen = white & ~kings
  const blackMen = reverse32(black & ~kings)
  const score =
    sumClasses(whiteMen, MAN_CLASSES.masks, MAN_CLASSES.values) +
    sumClasses(white & kings, KING_CLASSES.masks, KING_CLASSES.values) -
    sumClasses(blackMen, MAN_CLASSES.masks, MAN_CLASSES.values) -
    sumClasses(
      reverse32(black & kings),
      KING_CLASSES.masks,
      KING_CLASSES.values,
    )
  return finish(score, whiteMen, blackMen, side)
}

function evaluateLoop(
  white: number,
  black: number,
  kings: number,
  side: number,
): number {
  const whiteMen = white & ~kings
  const blackMen = reverse32(black & ~kings)
  const score =
    pieceSquareSum(whiteMen, MAN_TABLE) +
    pieceSquareSum(white & kings, KING_TABLE) -
    pieceSquareSum(blackMen, MAN_TABLE) -
    pieceSquareSum(reverse32(black & kings), KING_TABLE)
  return finish(score, whiteMen, blackMen, side)
}

type Evaluator = (w: number, b: number, k: number, s: number) => number

/** Random placements as parallel arrays, so the loop reads typed arrays. */
function placements(n: number): Int32Array[] {
  const rng = createRng(5)
  const columns = [0, 1, 2, 3].map(() => new Int32Array(n))
  for (let i = 0; i < n; i++) {
    const p = randomPlacement(rng)
    columns[0]![i] = p.white
    columns[1]![i] = p.black
    columns[2]![i] = p.kings
    columns[3]![i] = p.side
  }
  return columns
}

function evaluateAll(name: string, n: number, fn: Evaluator): Result {
  const [white, black, kings, side] = placements(n) as [
    Int32Array,
    Int32Array,
    Int32Array,
    Int32Array,
  ]
  return measure(
    `${name}, ${n} placements`,
    () => {
      for (let i = 0; i < n; i++) {
        sink ^= fn(white[i]!, black[i]!, kings[i]!, side[i]!)
      }
    },
    n,
  )
}

function benchEvaluate(): void {
  const classCount = MAN_CLASSES.masks.length + KING_CLASSES.masks.length
  // 1024 placements touch a few thousand table entries, which stay hot;
  // 65536 spread the lookups over the whole 1 MB of the 16-bit tables.
  report('evaluate (random placements)', 'eval', [
    evaluateAll('16-bit lookups (shipped, 1 MB)', 1024, evaluate),
    evaluateAll('8-bit lookups (4 KB)', 1024, evaluate8),
    evaluateAll(
      `popcount per value class (${classCount} classes)`,
      1024,
      evaluateClasses,
    ),
    evaluateAll('loop over pieces', 1024, evaluateLoop),
    evaluateAll('16-bit lookups (shipped, 1 MB)', 65536, evaluate),
    evaluateAll('8-bit lookups (4 KB)', 65536, evaluate8),
    evaluateAll('loop over pieces', 65536, evaluateLoop),
  ])
}

/*
 * Search: ns per node at a fixed depth (table cleared before every search,
 * timed around the search alone), then the depth reached within one second
 * per fixture with the table hit rate. Node counts show what ordering and
 * the table save; compare with perft's 35 ns per generate + make.
 */
function measureSearch(name: string, p: BitPosition, depth: number): Result {
  const limits: Limits = { variant: CHECKERS, depth, budgetMs: 0, margin: 0 }
  const run = (): number => {
    ttClear()
    const start = performance.now()
    const r = search(p.white, p.black, p.kings, p.side, p.plies, limits)
    const end = performance.now()
    sink ^= r.m0
    return ((end - start) * 1e6) / r.nodes
  }
  const warmupEnd = performance.now() + WARMUP_MS
  while (performance.now() < warmupEnd) run()
  const times: number[] = []
  for (let s = 0; s < SAMPLES; s++) times.push(run())
  times.sort((a, b) => a - b)
  const median = times[(SAMPLES - 1) >> 1]!
  const spread = (times[SAMPLES - 1]! - times[0]!) / median
  const nodes = searchStats().nodes
  return {
    name: `${name} depth ${depth} (${nodes} nodes)`,
    nsPerOp: median,
    spread,
  }
}

function benchSearch(): void {
  const results: Result[] = []
  for (const depth of [8, 10]) {
    for (const [name, p] of Object.entries(SEARCH_FIXTURES)) {
      results.push(measureSearch(name, p, depth))
    }
  }
  report('search: fixed depth', 'node', results)

  console.log('\n## search: one second per fixture\n')
  console.log('| fixture | depth | nodes | Mnode/s | TT hit rate |')
  console.log('| --- | ---: | ---: | ---: | ---: |')
  for (const [name, p] of Object.entries(SEARCH_FIXTURES)) {
    ttClear()
    const start = performance.now()
    const r = search(p.white, p.black, p.kings, p.side, p.plies, {
      variant: CHECKERS,
      depth: 64,
      budgetMs: 1000,
      margin: 0,
    })
    const ms = performance.now() - start
    const stats = searchStats()
    const rate = ((100 * stats.ttHits) / Math.max(1, stats.ttProbes)).toFixed(0)
    console.log(
      `| ${name} | ${r.depth} | ${r.nodes} | ${format(r.nodes / ms / 1000)} | ${rate}% |`,
    )
    sink ^= r.m0
  }

  // The same fixtures at поддавки. Move generation is shared, so what this
  // measures is the other evaluation and the other capture ordering: a
  // node rate far from the checkers one would mean the variant is costing
  // something it should not.
  console.log('\n## search: one second per fixture, поддавки\n')
  console.log('| fixture | depth | nodes | Mnode/s | TT hit rate |')
  console.log('| --- | ---: | ---: | ---: | ---: |')
  for (const [name, p] of Object.entries(SEARCH_FIXTURES)) {
    ttClear()
    const start = performance.now()
    const r = search(p.white, p.black, p.kings, p.side, p.plies, {
      variant: GIVEAWAY,
      depth: 64,
      budgetMs: 1000,
      margin: 0,
    })
    const ms = performance.now() - start
    const stats = searchStats()
    const rate = ((100 * stats.ttHits) / Math.max(1, stats.ttProbes)).toFixed(0)
    console.log(
      `| ${name} | ${r.depth} | ${r.nodes} | ${format(r.nodes / ms / 1000)} | ${rate}% |`,
    )
    sink ^= r.m0
  }
}

/*
 * Endgame tables: what a probe costs, and what the search does with them
 * on men-heavy roots, which is where they are read most and helped least.
 * A search that reaches the tables at every leaf inflates far more blocks
 * than it reads, so `inflates/s` is the number to watch: once it runs into
 * the thousands the cache is thrashing and the node rate falls with it.
 *
 * Each root is searched twice and the second search is the one reported,
 * because that is the state a game is in: the worker keeps its cache from
 * one move to the next.
 */
const TABLE_DIR = 'public/db/'

function loadTables(): number {
  dbClear()
  let slices = 0
  for (const name of readdirSync(TABLE_DIR)) {
    if (!name.endsWith('.bin')) continue
    dbAddSlice(new Uint8Array(readFileSync(TABLE_DIR + name)))
    slices++
  }
  return slices
}

/** Positions inside the tables, without a capture: what a probe sees. */
function probeFixtures(count: number): BitPosition[] {
  const rng = createRng(11)
  const out: BitPosition[] = []
  while (out.length < count) {
    const p = randomPlacement(rng)
    const pieces = popcount(p.white | p.black)
    if (pieces === 0 || pieces > dbPieces()) continue
    if (p.white === 0 || p.black === 0) continue
    if (generate(p.white, p.black, p.kings, p.side, OUT, 0) === 0) continue
    if (OUT[1] !== 0) continue
    out.push(p)
  }
  return out
}

const TABLE_ROOTS: Record<string, BitPosition> = {
  'six men': parsePos('W:Wc3,e3,g3:Bb6,d6,f6'),
  'eight men': parsePos('W:Wb2,c3,e3,g3:Ba7,b6,d6,f6'),
  'ten men': parsePos('W:Wb2,d2,c3,e3,g3:Ba7,c7,b6,d6,f6'),
}

function benchEndgame(): void {
  const slices = loadTables()
  const fixtures = probeFixtures(4096)
  let at = 0
  const result = measure('probe', () => {
    const p = fixtures[at++ & 4095]!
    sink ^= dbProbe(p.white, p.black, p.kings, p.side, p.plies)
  })
  report(`endgame tables: ${slices} slices, ${dbPieces()} pieces`, 'probe', [
    result,
  ])

  console.log('\n## endgame tables: one second per root\n')
  console.log('| root | tables | depth | Mnode/s | inflates/s |')
  console.log('| --- | --- | ---: | ---: | ---: |')
  for (const [name, p] of Object.entries(TABLE_ROOTS)) {
    for (const on of [false, true]) {
      if (on) loadTables()
      else dbClear()
      const limits: Limits = {
        variant: CHECKERS,
        depth: 64,
        budgetMs: 1000,
        margin: 0,
      }
      ttClear()
      sink ^= search(p.white, p.black, p.kings, p.side, p.plies, limits).m0
      ttClear()
      const before = dbStats().inflates
      const start = performance.now()
      const r = search(p.white, p.black, p.kings, p.side, p.plies, limits)
      const ms = performance.now() - start
      const inflates = dbStats().inflates - before
      console.log(
        `| ${name} | ${on ? 'on' : 'off'} | ${r.depth} |` +
          ` ${format(r.nodes / ms / 1000)} | ${Math.round((inflates * 1000) / ms)} |`,
      )
      sink ^= r.m0
    }
  }
  dbClear()
}

/*
 * Уголки: the other engine on its own fixtures, the opening and two
 * positions along a random game. Each is loaded once, outside the timing,
 * the way the checkers rows take their fixtures ready-made; then the three
 * calls a node makes are timed on it, and the search is given a second.
 */
function benchCorners(): void {
  const walk = cornersWalk(createRng(2), 40)
  const fixtures: Record<string, Position> = {
    opening: cornersOpening(),
    midgame: walk[walk.length >> 1]!,
    late: walk[walk.length - 1]!,
  }
  const out = new Int32Array(CORNERS_MAX_MOVES)
  const results: Result[] = []
  for (const [name, p] of Object.entries(fixtures)) {
    loadCorners(p)
    const side = p.toMove === 'white' ? CORNERS_WHITE : CORNERS_BLACK
    results.push(
      measure(`generate ${name}`, () => {
        sink ^= generateCorners(side, out, 0)
      }),
      measure(`evaluate ${name}`, () => {
        sink ^= evaluateCorners(side)
      }),
      measure(`status ${name}`, () => {
        sink ^= cornersStatusOf(side, p.ply)
      }),
    )
  }
  report('уголки', 'call', results)

  console.log('\n## уголки search: one second per fixture\n')
  console.log('| fixture | depth | nodes | Mnode/s | TT hit rate |')
  console.log('| --- | ---: | ---: | ---: | ---: |')
  for (const [name, p] of Object.entries(fixtures)) {
    cornersTtClear()
    const start = performance.now()
    const r = searchCorners(p, { depth: 64, budgetMs: 1000, margin: 0 })
    const ms = performance.now() - start
    const stats = cornersStats()
    const rate = ((100 * stats.ttHits) / Math.max(1, stats.ttProbes)).toFixed(0)
    console.log(
      `| ${name} | ${r.depth} | ${r.nodes} | ${format(r.nodes / ms / 1000)} | ${rate}% |`,
    )
    sink ^= r.move
  }
}

const GROUPS: ReadonlyArray<readonly [string, () => void]> = [
  ['generate', benchGenerate],
  ['makeMove', benchMakeMove],
  ['perft', benchPerft],
  ['call', benchCallBoundary],
  ['popcount', benchPopcount],
  ['evaluate', benchEvaluate],
  ['search', benchSearch],
  ['endgame', benchEndgame],
  ['corners', benchCorners],
]

// `npm run bench -- evaluate` runs the groups whose name contains the word.
const only = (globalThis as { process?: { argv?: string[] } }).process
  ?.argv?.[2]
for (const [name, run] of GROUPS) {
  if (only === undefined || name.includes(only)) run()
}
console.log(`\n(sink ${sink & 0xffff})`)
