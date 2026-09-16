/* v8 ignore file */
/**
 * Persona round robin for ordering the opponents and tuning their limits.
 * Bundled with rolldown and run by node, like the bench:
 *
 *   npm run selfplay -- games=20 scale=0.05 seed=1 pairs=owl-fox,fox-hare
 *
 * `scale` multiplies every time budget so a tournament finishes in
 * minutes; the depth caps stay. Both sides share one transposition table,
 * cleared before every game. Colours alternate between games.
 *
 * `show=N` also prints the board after every move of the first N games of
 * each pairing, to watch how the personas actually play:
 *
 *   npm run selfplay -- games=1 pairs=raven-kitten show=1
 *
 * `db` says which side may use the endgame tables: `both` (the default),
 * `none`, or `a`/`b` for one side of every pairing. That is how the
 * tables are measured - the same persona against itself, one side blind:
 *
 *   npm run selfplay -- games=40 pairs=raven-raven db=a random=8
 *
 * `dbA` and `dbB` cap the material each side may look up, which is how
 * one set of tables is compared with another; without them a side reads
 * as much as its persona is allowed in a game. `dbdir` says where to
 * read the tables from:
 *
 *   npm run selfplay -- games=200 pairs=raven-raven pieces=7 \
 *     dbA=6 dbB=5 dbdir=/tmp/db6
 *
 * With `a` or `b` the table is cleared before every search as well, so a
 * score the tables produced can never reach the side playing without
 * them. `random=N` opens every game with N random plies, so a pairing of
 * one persona against itself does not play the same game every time.
 *
 * `pieces=N` starts every game from a random placement of N pieces
 * instead of the opening, which is how the endgame tables are measured
 * without waiting for a whole game to reach them:
 *
 *   npm run selfplay -- games=100 pairs=raven-raven db=a pieces=6
 *
 * Each placement is played twice, once from each side, so a position
 * that is already won is handed to both players in turn and the tally
 * says who converts it.
 */
import { readFileSync } from 'node:fs'
import { APPLIED, makeMove } from '../engine/apply.ts'
import { dbAddSlice, dbLimit } from '../engine/db.ts'
import { popcount } from '../engine/bitboard.ts'
import { formatBoard, formatMove, formatSide } from '../engine/board.ts'
import { MAX_MOVES, MOVE_SLOTS, generate } from '../engine/movegen.ts'
import { RANK_1, RANK_8 } from '../engine/bitboard.ts'
import { BLACK, WHITE, initialBitPosition } from '../engine/position.ts'
import type { BitPosition } from '../engine/position.ts'
import { formatPos } from '../engine/position.ts'
import { createRng } from '../engine/random.ts'
import { search } from '../engine/search.ts'
import {
  BLACK_WINS,
  DRAW,
  ONGOING,
  WHITE_WINS,
  statusOf,
} from '../engine/status.ts'
import { ttClear } from '../engine/tt.ts'
import { personas } from './personas.ts'
import type { PersonaId } from './personas.ts'
import { pickRoot } from './think.ts'

/** A game longer than this counts as a draw; the 30-ply rule ends most. */
const MAX_GAME_PLIES = 400

/** Which side of a pairing plays with the endgame tables. */
type DbSide = 'both' | 'none' | 'a' | 'b'

type Args = {
  games: number
  scale: number
  seed: number
  pairs: string[]
  /** Games per pairing whose moves are printed as boards. */
  show: number
  db: DbSide
  /** Random plies at the start of every game, to vary the openings. */
  random: number
  /** Pieces of the random placement every game starts from; 0 = opening. */
  pieces: number
  /** Material cap per side; -1 leaves the side with everything it has. */
  dbA: number
  dbB: number
  dbdir: string
}

function parseArgs(): Args {
  const argv =
    (globalThis as { process?: { argv?: string[] } }).process?.argv ?? []
  const args: Args = {
    games: 20,
    scale: 0.05,
    seed: 1,
    pairs: ['raven-owl', 'owl-fox', 'fox-hare', 'hare-kitten'],
    show: 0,
    db: 'both',
    random: 0,
    pieces: 0,
    dbA: -1,
    dbB: -1,
    dbdir: 'public/db',
  }
  for (const arg of argv.slice(2)) {
    const [key, value] = arg.split('=')
    if (value === undefined) continue
    if (key === 'games') args.games = Number(value)
    else if (key === 'scale') args.scale = Number(value)
    else if (key === 'seed') args.seed = Number(value)
    else if (key === 'pairs') args.pairs = value.split(',')
    else if (key === 'show') args.show = Number(value)
    else if (key === 'db') args.db = value as DbSide
    else if (key === 'random') args.random = Number(value)
    else if (key === 'pieces') args.pieces = Number(value)
    else if (key === 'dbA') args.dbA = Number(value)
    else if (key === 'dbB') args.dbB = Number(value)
    else if (key === 'dbdir') args.dbdir = value
  }
  return args
}

/**
 * Reads the tables `dbgen -out` wrote, the way the worker fetches them;
 * returns how many slices were read and the material they cover.
 */
function loadTables(dir: string): { slices: number; pieces: number } {
  const manifest = JSON.parse(readFileSync(`${dir}/manifest.json`, 'utf8')) as {
    maxPieces: number
    slices: Array<{ id: string }>
  }
  for (const slice of manifest.slices) {
    dbAddSlice(new Uint8Array(readFileSync(`${dir}/${slice.id}.bin`)))
  }
  return { slices: manifest.slices.length, pieces: manifest.maxPieces }
}

type Tally = {
  wins: number
  draws: number
  losses: number
  depth: number
  depthOther: number
  moves: number
  movesOther: number
  ms: number
  /** Moves played with few enough pieces for the tables to answer. */
  endgame: number
}

const OUT = new Int32Array(MAX_MOVES * MOVE_SLOTS)

/** Result of a finished game as `1-0`, `0-1` or `1/2-1/2`. */
function resultName(status: number): string {
  if (status === WHITE_WINS) return '1-0'
  if (status === BLACK_WINS) return '0-1'
  return '1/2-1/2'
}

/** One game of a pairing: who plays what, with which tables. */
type Game = {
  readonly white: PersonaId
  readonly black: PersonaId
  /** Whether side A of the pairing has white in this game. */
  readonly aIsWhite: boolean
  readonly scale: number
  /** Picks among the root moves within a persona's margin. */
  readonly rng: () => number
  /** Plays the random opening; shared by the two games of a pair. */
  readonly openingRng: () => number
  readonly openingPlies: number
  /** Where the game starts; the opening by default. */
  readonly start: BitPosition
  readonly tally: Tally
  readonly show: boolean
  /** Material each side may look up; 0 is no tables at all. */
  readonly dbWhite: number
  readonly dbBlack: number
  /** Pieces at or below which a move counts as played inside the tables. */
  readonly tablePieces: number
  /** The two sides differ, so the table must not carry scores between them. */
  readonly splitDb: boolean
}

/** Plays one game; returns WHITE_WINS, BLACK_WINS or DRAW. */
function play(game: Game): number {
  const { tally, show } = game
  ttClear()
  let p: BitPosition = game.start
  if (show) console.log(`${formatBoard(p)}\n`)
  for (let ply = 0; ; ply++) {
    const count = generate(p.white, p.black, p.kings, p.side, OUT, 0)
    const status = statusOf(count, p.side, p.plies)
    if (status !== ONGOING) {
      if (show) console.log(`${resultName(status)} after ${ply} plies\n`)
      return status
    }
    if (ply >= MAX_GAME_PLIES) {
      if (show) console.log(`${resultName(DRAW)}, ${ply} plies reached\n`)
      return DRAW
    }
    let m0: number
    let m1: number
    if (ply < game.openingPlies) {
      // A random opening, the same one for both games of a colour pair.
      const k = Math.min(count - 1, Math.floor(game.openingRng() * count))
      m0 = OUT[k * MOVE_SLOTS]!
      m1 = OUT[k * MOVE_SLOTS + 1]!
      if (show) console.log(`${moveNumber(ply, p)} random ${formatMove(m0)}`)
    } else {
      const id = p.side === WHITE ? game.white : game.black
      const persona = personas[id]
      const side = p.side === WHITE ? game.dbWhite : game.dbBlack
      dbLimit(side < 0 ? persona.endgamePieces : side)
      // Nothing the tables produced may reach the side playing blind.
      if (game.splitDb) ttClear()
      const start = performance.now()
      const r = search(p.white, p.black, p.kings, p.side, p.plies, {
        depth: persona.depth,
        budgetMs: Math.max(1, Math.round(persona.budgetMs * game.scale)),
        margin: persona.margin,
      })
      tally.ms += performance.now() - start
      if ((p.side === WHITE) === game.aIsWhite) {
        tally.depth += r.depth
        tally.moves++
      } else {
        tally.depthOther += r.depth
        tally.movesOther++
      }
      if (popcount(p.white | p.black) <= game.tablePieces) tally.endgame++
      const slot = pickRoot(
        r.root,
        persona.margin,
        persona.temperature,
        game.rng,
      )
      m0 = r.root[slot]!
      m1 = r.root[slot + 1]!
      if (show) {
        console.log(
          `${moveNumber(ply, p)} ${id} ${formatMove(m0)}` +
            ` (depth ${r.depth}, score ${r.root[slot + 2]!})`,
        )
      }
    }
    makeMove(p.white, p.black, p.kings, p.side, p.plies, m0, m1)
    p = {
      white: APPLIED[0]!,
      black: APPLIED[1]!,
      kings: APPLIED[2]!,
      side: p.side === WHITE ? BLACK : WHITE,
      plies: APPLIED[3]!,
    }
    if (show) console.log(`${formatSide(p)}\n${formatBoard(p)}\n`)
  }
}

/**
 * A random placement of `pieces` pieces, near enough even between the
 * sides, with no capture waiting for the side to move and a move to play.
 * Kings are common: they are what the tables mostly hold.
 */
function randomEndgame(rng: () => number, pieces: number): BitPosition {
  for (;;) {
    const whiteCount = Math.round(pieces / 2 + (rng() < 0.5 ? -0.25 : 0.25))
    let white = 0
    let black = 0
    let kings = 0
    let placed = 0
    while (placed < pieces) {
      const sq = Math.floor(rng() * 32)
      const b = 1 << sq
      if (((white | black) & b) !== 0) continue
      const king = rng() < 0.4
      if (placed < whiteCount) {
        if (!king && (b & RANK_8) !== 0) continue
        white |= b
      } else {
        if (!king && (b & RANK_1) !== 0) continue
        black |= b
      }
      if (king) kings |= b
      placed++
    }
    const side = rng() < 0.5 ? WHITE : BLACK
    const count = generate(white, black, kings, side, OUT, 0)
    // A capture on the board would decide the first move for the player,
    // and the tables do not answer such a position anyway.
    if (count === 0 || OUT[1] !== 0) continue
    if (generate(white, black, kings, side ^ 1, OUT, 0) === 0) continue
    return { white, black, kings, side: side as 0 | 1, plies: 0 }
  }
}

function moveNumber(ply: number, p: BitPosition): string {
  return `${Math.floor(ply / 2) + 1}.${p.side === WHITE ? '' : '..'}`
}

function main(): void {
  const args = parseArgs()
  const tables =
    args.db === 'none' ? { slices: 0, pieces: 0 } : loadTables(args.dbdir)
  console.log(
    `selfplay: ${args.games} games per pairing, budgets x${args.scale},` +
      ` seed ${args.seed}, ${args.random} random opening plies\n`,
  )
  console.log(
    args.db === 'none'
      ? 'endgame tables: off\n'
      : `endgame tables: ${tables.slices} slices from ${args.dbdir},` +
          ` ${describeDb(args)}\n`,
  )
  console.log(
    '| pairing | wins | draws | losses | depth | depth (other) |' +
      ' endgame moves | ms/move |',
  )
  console.log('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |')
  for (const pair of args.pairs) {
    const [a, b] = pair.split('-') as [PersonaId, PersonaId]
    if (!(a in personas) || !(b in personas)) {
      throw new Error(`unknown pairing: ${pair}`)
    }
    const tally: Tally = {
      wins: 0,
      draws: 0,
      losses: 0,
      depth: 0,
      depthOther: 0,
      moves: 0,
      movesOther: 0,
      ms: 0,
      endgame: 0,
    }
    const dbA = limitOf(args.db === 'both' || args.db === 'a', args.dbA)
    const dbB = limitOf(args.db === 'both' || args.db === 'b', args.dbB)
    for (let g = 0; g < args.games; g++) {
      const aIsWhite = g % 2 === 0
      const show = g < args.show
      if (show) {
        console.log(
          `\n${pair}, game ${g + 1}:` +
            ` white ${aIsWhite ? a : b}, black ${aIsWhite ? b : a}\n`,
        )
      }
      const start =
        args.pieces > 0
          ? randomEndgame(createRng(args.seed * 104729 + (g >> 1)), args.pieces)
          : initialBitPosition()
      if (show) console.log(`start ${formatPos(start)}\n`)
      const result = play({
        white: aIsWhite ? a : b,
        black: aIsWhite ? b : a,
        start,
        aIsWhite,
        scale: args.scale,
        rng: createRng(args.seed * 100003 + g),
        // Both games of a colour pair open the same way.
        openingRng: createRng(args.seed * 7919 + (g >> 1)),
        openingPlies: args.random,
        tally,
        show,
        dbWhite: aIsWhite ? dbA : dbB,
        dbBlack: aIsWhite ? dbB : dbA,
        // What the tables actually hold, capped by what a side may read.
        tablePieces: Math.min(tables.pieces, Math.max(dbA, dbB, 5)),
        splitDb: dbA !== dbB,
      })
      if (result === DRAW) tally.draws++
      else if ((result === WHITE_WINS) === aIsWhite) tally.wins++
      else tally.losses++
    }
    const depth = (tally.depth / Math.max(1, tally.moves)).toFixed(1)
    const depthOther = (
      tally.depthOther / Math.max(1, tally.movesOther)
    ).toFixed(1)
    const msPerMove = (
      tally.ms / Math.max(1, tally.moves + tally.movesOther)
    ).toFixed(1)
    console.log(
      `| ${a} vs ${b} | ${tally.wins} | ${tally.draws} | ${tally.losses} |` +
        ` ${depth} | ${depthOther} | ${tally.endgame} | ${msPerMove} |`,
    )
  }
}

/**
 * What one side may look up: nothing, the cap the run asked for, or -1
 * for whatever the persona is allowed in a game.
 */
function limitOf(allowed: boolean, cap: number): number {
  if (!allowed) return 0
  return cap
}

function describeDb(args: Args): string {
  const sides =
    args.db === 'both'
      ? 'both sides'
      : args.db === 'a'
        ? 'the first side only'
        : 'the second side only'
  if (args.dbA < 0 && args.dbB < 0) return sides
  return (
    `${sides}, at most ${args.dbA < 0 ? 'all' : args.dbA} against` +
    ` ${args.dbB < 0 ? 'all' : args.dbB} pieces`
  )
}

main()
