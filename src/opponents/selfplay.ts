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
 */
import { APPLIED, makeMove } from '../engine/apply.ts'
import { formatBoard, formatMove, formatSide } from '../engine/board.ts'
import { MAX_MOVES, MOVE_SLOTS, generate } from '../engine/movegen.ts'
import { BLACK, WHITE, initialBitPosition } from '../engine/position.ts'
import type { BitPosition } from '../engine/position.ts'
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

type Args = {
  games: number
  scale: number
  seed: number
  pairs: string[]
  /** Games per pairing whose moves are printed as boards. */
  show: number
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
  }
  for (const arg of argv.slice(2)) {
    const [key, value] = arg.split('=')
    if (value === undefined) continue
    if (key === 'games') args.games = Number(value)
    else if (key === 'scale') args.scale = Number(value)
    else if (key === 'seed') args.seed = Number(value)
    else if (key === 'pairs') args.pairs = value.split(',')
    else if (key === 'show') args.show = Number(value)
  }
  return args
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
}

const OUT = new Int32Array(MAX_MOVES * MOVE_SLOTS)

/** Result of a finished game as `1-0`, `0-1` or `1/2-1/2`. */
function resultName(status: number): string {
  if (status === WHITE_WINS) return '1-0'
  if (status === BLACK_WINS) return '0-1'
  return '1/2-1/2'
}

/** Plays one game; returns WHITE_WINS, BLACK_WINS or DRAW. */
function play(
  white: PersonaId,
  black: PersonaId,
  scale: number,
  rng: () => number,
  tally: Tally,
  first: PersonaId,
  show: boolean,
): number {
  ttClear()
  let p: BitPosition = initialBitPosition()
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
    const id = p.side === WHITE ? white : black
    const persona = personas[id]
    const start = performance.now()
    const r = search(p.white, p.black, p.kings, p.side, p.plies, {
      depth: persona.depth,
      budgetMs: Math.max(1, Math.round(persona.budgetMs * scale)),
      margin: persona.margin,
    })
    tally.ms += performance.now() - start
    if (id === first) {
      tally.depth += r.depth
      tally.moves++
    } else {
      tally.depthOther += r.depth
      tally.movesOther++
    }
    const slot = pickRoot(r.root, persona.margin, persona.temperature, rng)
    if (show) {
      const number = `${Math.floor(ply / 2) + 1}.${p.side === WHITE ? '' : '..'}`
      console.log(
        `${number} ${id} ${formatMove(r.root[slot]!)}` +
          ` (depth ${r.depth}, score ${r.root[slot + 2]!})`,
      )
    }
    makeMove(
      p.white,
      p.black,
      p.kings,
      p.side,
      p.plies,
      r.root[slot]!,
      r.root[slot + 1]!,
    )
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

function main(): void {
  const args = parseArgs()
  console.log(
    `selfplay: ${args.games} games per pairing, budgets x${args.scale}, seed ${args.seed}\n`,
  )
  console.log(
    '| pairing | wins | draws | losses | depth | depth (other) | ms/move |',
  )
  console.log('| --- | ---: | ---: | ---: | ---: | ---: | ---: |')
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
    }
    for (let g = 0; g < args.games; g++) {
      const rng = createRng(args.seed * 100003 + g)
      const aIsWhite = g % 2 === 0
      const show = g < args.show
      if (show) {
        console.log(
          `\n${pair}, game ${g + 1}:` +
            ` white ${aIsWhite ? a : b}, black ${aIsWhite ? b : a}\n`,
        )
      }
      const result = play(
        aIsWhite ? a : b,
        aIsWhite ? b : a,
        args.scale,
        rng,
        tally,
        a,
        show,
      )
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
      `| ${a} vs ${b} | ${tally.wins} | ${tally.draws} | ${tally.losses} | ${depth} | ${depthOther} | ${msPerMove} |`,
    )
  }
}

main()
