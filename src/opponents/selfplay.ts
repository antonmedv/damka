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
 * `variant=giveaway` plays поддавки instead of checkers; the tables are
 * then off for both sides whatever `db` says, because they hold checkers
 * values. `variant=corners` plays уголки on its own engine, where only
 * `games`, `scale`, `seed`, `pairs`, `show` and `random` apply, and
 * `weights=step,inside,straggler,tempo` replaces that engine's evaluation
 * weights. `weightsB` gives the second side of every pairing weights of
 * its own, which is how one set is measured against another:
 *
 *   npm run selfplay -- variant=corners games=100 pairs=owl-owl random=4 \
 *     weights=100,20,50,5 weightsB=100,20,0,5
 *
 * `baseline` says which side searches on the negated checkers
 * evaluation instead of the поддавки one, which is how the latter is
 * measured against what it replaced:
 *
 *   npm run selfplay -- variant=giveaway games=200 pairs=owl-owl \
 *     baseline=b random=6
 *
 * `weights=man,king,promotion,tempo` replaces the поддавки evaluation's
 * numbers for the run, so a set can be tried without touching the engine.
 * The two together are how the shipped set was found:
 *
 *   npm run selfplay -- variant=giveaway games=400 pairs=owl-owl \
 *     baseline=b random=6 weights=100,400,1,5
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
import {
  formatBoard as formatCornersBoard,
  initialPosition as cornersOpening,
} from '../corners/board.ts'
import {
  DEFAULT_WEIGHTS as CORNERS_WEIGHTS,
  weights as cornersWeights,
} from '../corners/eval.ts'
import type { Weights as CornersWeights } from '../corners/eval.ts'
import { detailedOf as cornersDetailedOf } from '../corners/movegen.ts'
import { search as searchCorners } from '../corners/search.ts'
import { status as cornersStatus } from '../corners/status.ts'
import { ttClear as cornersTtClear } from '../corners/tt.ts'
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
import {
  DEFAULT_WEIGHTS,
  baselineEval,
  weights,
} from '../engine/evalGiveaway.ts'
import { ttClear } from '../engine/tt.ts'
import { CHECKERS, GIVEAWAY } from '../engine/variant.ts'
import type { Variant } from '../engine/variant.ts'
import { applyMove } from '../game/apply.ts'
import { legalMoves } from '../game/moves.ts'
import { formatMove as formatCornersMove } from '../game/notation.ts'
import type { Position } from '../game/types.ts'
import { personas } from './personas.ts'
import type { PersonaId } from './personas.ts'
import { pickRoot } from './think.ts'

/** A game longer than this counts as a draw; the 30-ply rule ends most. */
const MAX_GAME_PLIES = 400

/** Which side of a pairing plays with the endgame tables. */
type DbSide = 'both' | 'none' | 'a' | 'b'

/** Which side of a pairing plays поддавки on the old, negated evaluation. */
type EvalSide = 'none' | 'both' | 'a' | 'b'

type Args = {
  /** Which checkers game the tournament plays; moot when `corners` is set. */
  variant: Variant
  /** Уголки instead: the other engine, and its own game loop. */
  corners: boolean
  games: number
  scale: number
  seed: number
  pairs: string[]
  /** Games per pairing whose moves are printed as boards. */
  show: number
  db: DbSide
  /** Side playing on the baseline поддавки evaluation; see `baselineEval`. */
  baseline: EvalSide
  /**
   * `man,king,promotion,tempo` for the поддавки evaluation, or
   * `step,inside,straggler,tempo` for the уголки one, so a set can be
   * tried without editing the engine. Empty leaves it as it ships.
   */
  weights: string
  /** Уголки weights for side B of every pairing; empty means the same as A. */
  weightsB: string
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
    variant: CHECKERS,
    corners: false,
    games: 20,
    scale: 0.05,
    seed: 1,
    pairs: ['raven-owl', 'owl-fox', 'fox-hare', 'hare-kitten'],
    show: 0,
    db: 'both',
    baseline: 'none',
    weights: '',
    weightsB: '',
    random: 0,
    pieces: 0,
    dbA: -1,
    dbB: -1,
    dbdir: 'public/db',
  }
  for (const arg of argv.slice(2)) {
    const [key, value] = arg.split('=')
    if (value === undefined) continue
    if (key === 'variant') {
      args.variant = value === 'giveaway' ? GIVEAWAY : CHECKERS
      args.corners = value === 'corners'
    } else if (key === 'games') args.games = Number(value)
    else if (key === 'scale') args.scale = Number(value)
    else if (key === 'seed') args.seed = Number(value)
    else if (key === 'pairs') args.pairs = value.split(',')
    else if (key === 'show') args.show = Number(value)
    else if (key === 'db') args.db = value as DbSide
    else if (key === 'baseline') args.baseline = value as EvalSide
    else if (key === 'weights') args.weights = value
    else if (key === 'weightsB') args.weightsB = value
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
  readonly variant: Variant
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
  /** Which colour searches on the baseline поддавки evaluation. */
  readonly baseWhite: boolean
  readonly baseBlack: boolean
  /** The two sides differ, so no score may be carried between them. */
  readonly splitEval: boolean
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
    const status = statusOf(count, p.side, p.plies, game.variant)
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
      // поддавки never reads the tables; they hold checkers values.
      dbLimit(
        game.variant === GIVEAWAY ? 0 : side < 0 ? persona.endgamePieces : side,
      )
      baselineEval(p.side === WHITE ? game.baseWhite : game.baseBlack)
      // Nothing one evaluation produced may reach the side on the other.
      if (game.splitDb || game.splitEval) ttClear()
      const start = performance.now()
      const r = search(p.white, p.black, p.kings, p.side, p.plies, {
        variant: game.variant,
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

/** The уголки game of a pairing: what the checkers `Game` has that applies. */
type CornersGame = Pick<
  Game,
  | 'white'
  | 'black'
  | 'aIsWhite'
  | 'scale'
  | 'rng'
  | 'openingRng'
  | 'openingPlies'
  | 'tally'
  | 'show'
> & {
  /** Evaluation weights of each colour; the tables are rebuilt per move. */
  readonly weightsWhite: CornersWeights
  readonly weightsBlack: CornersWeights
}

/**
 * One game of уголки on the other engine, through the game layer: the
 * blocking rules end every game, so there is no ply cap of its own. The
 * table is shared and cleared before the game, as at checkers, and before
 * every search when the two sides evaluate differently, so nothing one
 * evaluation produced reaches the other.
 */
function playCorners(game: CornersGame): number {
  const { tally, show } = game
  const splitEval = game.weightsWhite !== game.weightsBlack
  cornersTtClear()
  let position: Position = cornersOpening()
  if (show) console.log(`${formatCornersBoard(position)}\n`)
  for (let ply = 0; ; ply++) {
    // One move list for the status check and the random opening both.
    const moves = legalMoves(position, 'corners')
    const result = cornersStatus(position, moves.length)
    if (result !== ONGOING) {
      if (show) console.log(`${resultName(result)} after ${ply} plies\n`)
      return result
    }
    const white = position.toMove === 'white'
    const number = `${Math.floor(ply / 2) + 1}.${white ? '' : '..'}`
    let move = moves[0]!
    if (ply < game.openingPlies) {
      move =
        moves[
          Math.min(
            moves.length - 1,
            Math.floor(game.openingRng() * moves.length),
          )
        ]!
      if (show) console.log(`${number} random ${formatCornersMove(move)}`)
    } else {
      const id = white ? game.white : game.black
      const persona = personas[id]
      cornersWeights(white ? game.weightsWhite : game.weightsBlack)
      if (splitEval) cornersTtClear()
      const start = performance.now()
      const r = searchCorners(position, {
        depth: persona.depth,
        budgetMs: Math.max(1, Math.round(persona.budgetMs * game.scale)),
        margin: persona.margin,
      })
      tally.ms += performance.now() - start
      if (white === game.aIsWhite) {
        tally.depth += r.depth
        tally.moves++
      } else {
        tally.depthOther += r.depth
        tally.movesOther++
      }
      const slot = pickRoot(
        r.root,
        persona.margin,
        persona.temperature,
        game.rng,
      )
      move = cornersDetailedOf(position, r.root[slot]!)
      if (show) {
        console.log(
          `${number} ${id} ${formatCornersMove(move)}` +
            ` (depth ${r.depth}, score ${r.root[slot + 2]!})`,
        )
      }
    }
    position = applyMove(position, move)
    if (show) console.log(`${formatCornersBoard(position)}\n`)
  }
}

/**
 * Comma-separated weights. An empty entry keeps the shipped value;
 * anything that is not a number is refused here, since the engines' int
 * tables would store a `NaN` as zero and the run would measure nothing.
 */
function numbersOf(text: string): (number | undefined)[] {
  return text.split(',').map((part) => {
    if (part === '') return undefined
    const value = Number(part)
    if (!Number.isFinite(value)) {
      throw new Error(`not a number in weights: ${part}`)
    }
    return value
  })
}

/** Уголки weights from `step,inside,straggler,tempo`; the shipped set when empty. */
function cornersWeightsOf(text: string): CornersWeights {
  if (text === '') return CORNERS_WEIGHTS
  const [step, inside, straggler, tempo] = numbersOf(text)
  return {
    step: step ?? CORNERS_WEIGHTS.step,
    inside: inside ?? CORNERS_WEIGHTS.inside,
    straggler: straggler ?? CORNERS_WEIGHTS.straggler,
    tempo: tempo ?? CORNERS_WEIGHTS.tempo,
  }
}

function main(): void {
  const args = parseArgs()
  const cornersA = cornersWeightsOf(args.weights)
  const cornersB =
    args.weightsB === '' ? cornersA : cornersWeightsOf(args.weightsB)
  if (args.corners && (args.weights !== '' || args.weightsB !== '')) {
    console.log(
      `уголки weights: A ${args.weights || 'shipped'}, B ${args.weightsB || 'as A'}\n`,
    )
  } else if (args.weights !== '') {
    const [man, king, promotion, tempo] = numbersOf(args.weights)
    weights({
      man: man ?? DEFAULT_WEIGHTS.man,
      king: king ?? DEFAULT_WEIGHTS.king,
      promotion: promotion ?? DEFAULT_WEIGHTS.promotion,
      tempo: tempo ?? DEFAULT_WEIGHTS.tempo,
    })
    console.log(`поддавки weights: ${args.weights}\n`)
  }
  // Only checkers probes the tables, so no other run should load them
  // either - or print a line claiming it did.
  const useDb = args.db !== 'none' && args.variant === CHECKERS && !args.corners
  const tables = useDb ? loadTables(args.dbdir) : { slices: 0, pieces: 0 }
  console.log(
    `selfplay: ${args.games} games per pairing, budgets x${args.scale},` +
      ` seed ${args.seed}, ${args.random} random opening plies\n`,
  )
  console.log(
    useDb
      ? `endgame tables: ${tables.slices} slices from ${args.dbdir},` +
          ` ${describeDb(args)}\n`
      : 'endgame tables: off\n',
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
    const baseA = args.baseline === 'both' || args.baseline === 'a'
    const baseB = args.baseline === 'both' || args.baseline === 'b'
    for (let g = 0; g < args.games; g++) {
      const aIsWhite = g % 2 === 0
      const show = g < args.show
      if (show) {
        console.log(
          `\n${pair}, game ${g + 1}:` +
            ` white ${aIsWhite ? a : b}, black ${aIsWhite ? b : a}\n`,
        )
      }
      const shared = {
        white: aIsWhite ? a : b,
        black: aIsWhite ? b : a,
        aIsWhite,
        scale: args.scale,
        rng: createRng(args.seed * 100003 + g),
        // Both games of a colour pair open the same way.
        openingRng: createRng(args.seed * 7919 + (g >> 1)),
        openingPlies: args.random,
        tally,
        show,
      }
      if (args.corners) {
        const result = playCorners({
          ...shared,
          weightsWhite: aIsWhite ? cornersA : cornersB,
          weightsBlack: aIsWhite ? cornersB : cornersA,
        })
        if (result === DRAW) tally.draws++
        else if ((result === WHITE_WINS) === aIsWhite) tally.wins++
        else tally.losses++
        continue
      }
      const start =
        args.pieces > 0
          ? randomEndgame(createRng(args.seed * 104729 + (g >> 1)), args.pieces)
          : initialBitPosition()
      if (show) console.log(`start ${formatPos(start)}\n`)
      const result = play({
        ...shared,
        variant: args.variant,
        start,
        dbWhite: aIsWhite ? dbA : dbB,
        dbBlack: aIsWhite ? dbB : dbA,
        baseWhite: aIsWhite ? baseA : baseB,
        baseBlack: aIsWhite ? baseB : baseA,
        splitEval: baseA !== baseB,
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
