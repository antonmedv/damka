import {Pool, spawn, Worker} from 'threads'
import {worker} from '../worker'
import {isDraw, Player} from './game'
import {generateAllPossibleMoves, State} from './state'
import {random} from './utils'

const pool = Pool(() => spawn<worker>(new Worker('worker.js')))

export async function workerInfo(): Promise<string> {
  return pool.queue(async worker => await worker.info())
}

export async function computer(state: State, player: Player, depth: number, netId: number): Promise<string | undefined> {
  let moves = generateAllPossibleMoves(state, player)
  console.log(`Moves: ${moves.length}`)

  if (moves.length == 0) {
    console.log('LOSE', player)
    return undefined
  }
  if (isDraw(state, player)) {
    console.log('DRAW', player)
    return undefined
  }

  if (moves.length === 1) {
    return moves[0]
  }

  let ratedMoves: { move: string, rate: number }[] = []

  for (let move of moves) {
    pool.queue(async worker => {
      let rate = await worker.evaluateMove(netId, state, move, depth, player == 'black' ? 'white' : 'black')
      ratedMoves.push({rate, move})
    })
  }

  await pool.completed()

  let bestRate = player == 'black' ? Infinity : -Infinity
  let bestMoves: string[] = []

  for (let {move, rate} of ratedMoves) {
    if (player == 'black' ? rate < bestRate : rate > bestRate) {
      bestRate = rate
      bestMoves = [move]
    }
    if (rate == bestRate) {
      bestMoves.push(move)
    }
  }

  let allLose = true
  for (let {move, rate} of ratedMoves) {
    if (rate != 1) {
      allLose = false
    }
  }

  if (allLose) {
    console.log('All will loose, try to avoid bad move.')
    if (depth > 6) {
      depth = 6
    }
    depth--
    if (depth > 0) {
      return await computer(state, player, depth, netId)
    }
  }

  let move = random(bestMoves)
  console.log(`<< ${move} = ${bestRate} >>`)
  return move
}
