import {isDraw, play, Player} from '../src/game'
import {Generation} from '../src/models'
import {isDrawNaive, set_QUEENS_MOVES_TO_DRAW} from '../src/draw'
import {createEmptyBoardState, State, stringify} from '../src/state'
import {load} from './utils/helpers'

let gen: Generation = load(__dirname + '/../../14619.json')
let net = gen.population[0].net

set_QUEENS_MOVES_TO_DRAW(5)

void async function main() {
  let SUCCESS = true

  if (false) {
    let [I, J] = [0, 0, 0, 0]
    for (let i = I; i < 32; i++) {
      for (let j = J; j < 32; j++) {
        if (j == i) continue

        let state = createEmptyBoardState()
        state.cells[i] = 'X'
        state.cells[j] = 'O'

        console.log('Progress', [i, j])
        if (!check(state, 'white', 2)) SUCCESS = false
        if (!check(state, 'black', 2)) SUCCESS = false
      }
    }
  } else {
    console.log('1vs1 pieces check disabled')
  }

  if (true) {
    let DB = []
    let [I, J, K, L] = [0, 0, 0, 0]
    for (let i = I; i < 32; i++) {

      for (let j = J; j < 32; j++) {
        if (i == j) continue

        for (let k = K; k < 32; k++) {
          if (k == i || k == j) continue

          for (let l = L; l < 32; l++) {
            if (l == i || l == j || l == k) continue

            let state = createEmptyBoardState()
            state.cells[i] = 'X'
            state.cells[j] = 'X'
            state.cells[k] = 'X'
            state.cells[l] = 'O'

            console.log('Progress', [i, j, l, k])
            if (!check(state, 'black', 3)) {
              SUCCESS = false
              DB.push(JSON.stringify(state))
            }
          }
        }
      }
    }
    console.log(JSON.stringify(DB))
  } else {
    console.log('3vs1 pieces check disabled')
  }

  if (SUCCESS) {
    console.log('Success! All draws was predicted!')
  } else {
    console.log('Errors occurred =(')
  }
}()


function check(state: State, player: Player, depth: number): boolean {
  let draw = isDraw(state, player)

  let result = play(state, player, net, net, depth)
  if (draw != (result == 'draw')) {
    console.log('ERROR', player)
    console.log(stringify(state))
    console.log('>>', result)
    console.log('predict', draw ? 'draw' : 'no draw')
    console.log('state', JSON.stringify(state.cells))
    console.log('')
    return false
  }

  return true
}

function checkOnlyDraw(state: State, player: Player, depth: number): boolean {
  let draw = isDraw(state, player)
  if (draw) {
    return check(state, player, depth)
  }
  console.log('skip')
  return true
}
