import {expose} from 'threads/worker'
import {minimax, Player} from './src/game'
import {Generation} from './src/models'
import {apply, State} from './src/state'
import {VERSION} from './src/version'

const GEN: Generation = require('./14619.json')

const worker = {
  info(): string {
    return `gen:${GEN.number} worker:${VERSION}`
  },
  evaluateMove(netId: number,
               state: State,
               move: string,
               depth: number,
               player: Player): number {
    let net = GEN.population[netId].net
    apply(state, move)
    let rate = minimax(state, depth, -Infinity, Infinity, player, net)
    console.log(` ${move} = ${rate}`)
    return rate
  },
}

export type worker = typeof worker
expose(worker)
