/**
 * Deterministic random positions for differential tests and benchmarks.
 */
import { applyMove } from '../game/apply.ts'
import type { Piece, Position } from '../game/types.ts'
import { MEN, initialPosition } from './board.ts'
import { generateDetailed } from './movegen.ts'

/**
 * Positions along one game of uniformly random legal moves from the
 * start, up to `maxPlies`. The first entry is the opening. The blocking
 * rules are ignored: the walk is about the generator, not the game.
 */
export function randomWalk(rng: () => number, maxPlies: number): Position[] {
  const walk: Position[] = [initialPosition()]
  let position = walk[0]!
  for (let ply = 0; ply < maxPlies; ply++) {
    const moves = generateDetailed(position)
    if (moves.length === 0) break
    position = applyMove(position, moves[Math.floor(rng() * moves.length)]!)
    walk.push(position)
  }
  return walk
}

/**
 * A random placement: up to `MEN` men a side on distinct squares anywhere
 * on the board, a side possibly empty. Not necessarily reachable in a
 * game, which is fine for comparing two generators.
 */
export function randomPlacement(rng: () => number): Position {
  const board: (Piece | undefined)[] = new Array<Piece | undefined>(64).fill(
    undefined,
  )
  const count = 1 + Math.floor(rng() * 2 * MEN)
  let white = 0
  let black = 0
  let placed = 0
  while (placed < count) {
    const sq = Math.floor(rng() * 64)
    if (board[sq] !== undefined) continue
    const toWhite = white < MEN && (black >= MEN || rng() < 0.5)
    board[sq] = { color: toWhite ? 'white' : 'black', kind: 'man' }
    if (toWhite) white++
    else black++
    placed++
  }
  return {
    board,
    toMove: rng() < 0.5 ? 'white' : 'black',
    drawCounter: 0,
    ply: Math.floor(rng() * 40),
  }
}
