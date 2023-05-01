import {Pool, spawn, Worker} from 'threads'
import {Generation} from '../src/models'
import {Network} from '../src/network'
import {createStartGameState} from '../src/state'
import {random} from '../src/utils'
import {arena} from './arena'
import {load} from './utils/helpers'

let white: Generation = load(process.argv[2])
let black: Generation = process.argv[3] ? load(process.argv[3]) : {population: []}
let zero: Network = load(__dirname + '/utils/net_zero.json')

let A = white.population.slice(0, 10).map(c => c.net)
let B = black.population.slice(0, 10).map(c => c.net)
if (B.length == 0) {
  B = [zero]
}

// [A, B] = [B, A]

let depth = 4
let total = 100

const pool = Pool(() => spawn<arena>(new Worker('arena.js')))
let s = {
  'white won': 0,
  'black won': 0,
  'draw': 0,
}

void async function main() {
  let tasks = []
  for (let i = 0; i < total; i++) {
    tasks.push(pool.queue(async arena => {
      let result = await arena.play(createStartGameState(), 'white', random(A), random(B), depth)
      s[result]++
      console.log(JSON.stringify(s, null, 2))
    }))
  }
  await Promise.all(tasks)
  await pool.terminate()
}()
