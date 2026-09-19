/**
 * Legal moves of уголки on the loaded board.
 *
 * A man steps to any of its four empty neighbours, or jumps: over an
 * adjacent man of either colour onto the empty square straight beyond,
 * and on from there as often as it likes. Every landing square of a chain
 * is a legal destination, so the jumps of one man are a breadth-first
 * walk over landing squares, each visited once. The walk finds the
 * shortest chain to every destination, which is the path the UI shows.
 *
 * Hot path rules as in the checkers generator: int locals and typed
 * arrays, no objects or closures. Not reentrant: the walk keeps its state
 * in module-level scratch.
 */
import { squareName } from '../game/board.ts'
import type { Move, Position } from '../game/types.ts'
import { moveFrom, moveTo, packMove } from './apply.ts'
import { BOARD, EMPTY, NEIGHBOR, isStep, load, manOf } from './board.ts'
import { formatCorners } from './position.ts'

/**
 * Upper bound on moves in one position; the search stack uses it as
 * stride. A man reaches at most every empty square, so nine men on a board
 * with fifty-five empty squares give under five hundred; the bound leaves
 * room for bigger homes.
 */
export const MAX_MOVES = 1024

/** Landing squares seen in the current walk, by stamp. */
const SEEN = new Int32Array(64)
/** Where the walk came from, so a chain can be traced back. */
const PARENT = new Int8Array(64)
const QUEUE = new Int8Array(64)
let stamp = 0

/**
 * Writes every legal move for `side` into `out` from slot `base`, one slot
 * per move, and returns how many.
 */
export function generate(side: number, out: Int32Array, base: number): number {
  const man = manOf(side)
  let cursor = base
  for (let from = 0; from < 64; from++) {
    if (BOARD[from] === man) cursor += generateFrom(from, out, cursor)
  }
  return cursor - base
}

/**
 * The moves of the man on `from`: its steps, then its jump chains. Leaves
 * `PARENT` describing the chains, valid until the next call.
 */
function generateFrom(from: number, out: Int32Array, base: number): number {
  let cursor = base
  const at = from << 2
  for (let dir = 0; dir < 4; dir++) {
    const to = NEIGHBOR[at + dir]!
    if (to >= 0 && BOARD[to] === EMPTY) out[cursor++] = packMove(from, to)
  }
  // The man is in the air for the whole chain: its own square is empty,
  // so it is neither jumped over nor landed on.
  const man = BOARD[from]!
  BOARD[from] = EMPTY
  if (++stamp === 0x7fffffff) {
    SEEN.fill(0)
    stamp = 1
  }
  SEEN[from] = stamp
  QUEUE[0] = from
  let head = 0
  let tail = 1
  while (head < tail) {
    const sq = QUEUE[head++]!
    const here = sq << 2
    for (let dir = 0; dir < 4; dir++) {
      const over = NEIGHBOR[here + dir]!
      if (over < 0 || BOARD[over] === EMPTY) continue
      const land = NEIGHBOR[(over << 2) + dir]!
      if (land < 0 || BOARD[land] !== EMPTY || SEEN[land] === stamp) continue
      SEEN[land] = stamp
      PARENT[land] = sq
      QUEUE[tail++] = land
      out[cursor++] = packMove(from, land)
    }
  }
  BOARD[from] = man
  return cursor - base
}

const NO_CAPTURES: ReadonlyArray<number> = []
const SCRATCH = new Int32Array(MAX_MOVES)

/**
 * Every legal move of the side to move as a UI `Move`: no captures, no
 * promotion, and the landing squares of the shortest chain as the path. A
 * step's path is its one square.
 */
export function generateDetailed(position: Position): Move[] {
  load(position)
  const man = manOf(position.toMove === 'white' ? 0 : 1)
  const moves: Move[] = []
  for (let from = 0; from < 64; from++) {
    if (BOARD[from] !== man) continue
    const count = generateFrom(from, SCRATCH, 0)
    for (let i = 0; i < count; i++) {
      const to = SCRATCH[i]! >>> 6
      moves.push({
        from,
        to,
        captures: NO_CAPTURES,
        promotes: false,
        path: pathTo(from, to),
      })
    }
  }
  return moves
}

/**
 * The UI move a packed engine move stands for in `position`: the search
 * hands back a square pair, and the path the board animates is only known
 * here. Throws if the pair is not a legal move, which would mean the
 * search and the rules disagree.
 */
export function detailedOf(position: Position, packed: number): Move {
  const from = moveFrom(packed)
  const to = moveTo(packed)
  const move = generateDetailed(position).find(
    (candidate) => candidate.from === from && candidate.to === to,
  )
  if (move === undefined) {
    throw new Error(
      `${squareName(from)}-${squareName(to)} is not legal in ${formatCorners(position)}`,
    )
  }
  return move
}

/** Landing squares from `from` to `to` along `PARENT`; `[to]` for a step. */
function pathTo(from: number, to: number): number[] {
  const path: number[] = [to]
  if (isStep(from, to)) return path
  for (let sq = PARENT[to]!; sq !== from; sq = PARENT[sq]!) path.push(sq)
  return path.reverse()
}
