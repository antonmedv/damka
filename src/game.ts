import {calc, Network} from './network'
import {isDraw} from './draw'
import {random} from './utils'
import {apply, copy, generateAllPossibleMoves, State} from './state'

export {isDraw}

export type Player = 'white' | 'black'
export type Piece = 'o' | 'O' | 'x' | 'X'
export type Cell = Piece | ' '

export function opponent(player: Player): Player {
  return player == 'black' ? 'white' : 'black'
}

export function onCell(cell: Cell): Piece | undefined {
  if (cell == ' ') return undefined
  return cell
}

export function ofPlayer(p: Piece): Player {
  switch (p) {
    case 'X':
    case 'x':
      return 'black'
    case 'o':
    case 'O':
      return 'white'
  }
}

export function isMen(p: Piece): boolean {
  switch (p) {
    case 'x':
    case 'o':
      return true
    case 'X':
    case 'O':
      return false
  }
}

export function isQueen(p: Piece): boolean {
  return !isMen(p)
}

export type GameResult = 'white won' | 'black won' | 'draw'

export type play = typeof play

export function play(
  state: State,
  player: Player,
  white: Network | undefined,
  black: Network | undefined,
  depth: number,
): GameResult {
  while (true) {
    let net = player == 'white' ? white : black
    let nextPlayer: Player = opponent(player)
    let moves = generateAllPossibleMoves(state, player)

    if (moves.length == 0) {
      return player == 'black' ? 'white won' : 'black won'
    }
    if (isDraw(state, player)) {
      return 'draw'
    }

    let ratedMoves: { move: string, rate: number }[] = []
    for (let move of moves) {
      let nextState = copy(state)
      apply(nextState, move)
      let rate = minimax(nextState, depth, -Infinity, Infinity, nextPlayer, net)
      //console.log(`? ${move} = ${rate}`)
      ratedMoves.push({rate, move})
    }

    let move: string
    if (ratedMoves.length == 1) {
      move = ratedMoves[0].move
    } else {
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
      move = random(bestMoves)
    }

    // console.log(`> ${move}`)
    let nextState = copy(state)
    apply(nextState, move)
    state = nextState
    // console.log(stringify(state))
    player = nextPlayer
  }
}

export function minimax(
  state: State,
  depth: number,
  alpha: number,
  beta: number,
  player: Player,
  net: Network | undefined,
): number {
  let possibleMoves = generateAllPossibleMoves(state, player)
  let lose = possibleMoves.length == 0
  // Maybe not needed.
  // let draw = isDraw(state, player)

  if (lose) {
    return (player == 'white' ? -1 : 1) * (1 + .01 * depth)
  }
  // if (draw) {
  //   return 0
  // }
  if (possibleMoves.length == 1) {
    apply(state, possibleMoves[0])
    return minimax(state, depth, alpha, beta, opponent(player), net)
  }
  if (depth <= 0 && net) {
    return evaluate(state, player, net)
  }

  if (player == 'white') {
    let maxRate = -Infinity
    for (let i = 0; i < possibleMoves.length; i++) {
      let nextState = copy(state)
      apply(nextState, possibleMoves[i])
      let rate = minimax(nextState, depth - 1, alpha, beta, 'black', net)
      if (rate > maxRate) {
        maxRate = rate
      }
      if (rate > alpha) {
        alpha = rate
      }
      if (beta <= alpha) {
        break
      }
    }
    return maxRate
  } else {
    let minRate = Infinity
    for (let i = 0; i < possibleMoves.length; i++) {
      let nextState = copy(state)
      apply(nextState, possibleMoves[i])
      let rate = minimax(nextState, depth - 1, alpha, beta, 'white', net)
      if (rate < minRate) {
        minRate = rate
      }
      if (rate < beta) {
        beta = rate
      }
      if (beta <= alpha) {
        break
      }
    }
    return minRate
  }
}

export function evaluate(state: State, player: Player, net: Network): number {
  let inputs = Array(32)
  if (player == 'white') {
    for (let i = 0; i < 32; i++) {
      inputs[i] = cellValue(state.cells[i], net.K)
    }
  } else {
    for (let i = 31; i >= 0; i--) {
      inputs[31 - i] = -cellValue(state.cells[i], net.K)
    }
  }

  let rate = calc(net, inputs)[0]

  if (player != 'white') {
    rate = -rate
  }

  return rate
}

function cellValue(c: Cell, K: number): number {
  switch (c) {
    case 'X':
      return -K
    case 'x':
      return -1
    case 'o':
      return 1
    case 'O':
      return K
    case ' ':
      return 0
  }
}
