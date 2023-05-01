import {expose} from 'threads/worker'
import {GameResult, play, Player} from '../src/game'
import {Network} from '../src/network'
import {State} from '../src/state'

const arena = {
  play(
    state: State,
    player: Player,
    white: Network | undefined,
    black: Network | undefined,
    depth: number,
  ): GameResult {
    return play(state, player, white, black, depth)
  },
}

export type arena = typeof arena
expose(arena)
