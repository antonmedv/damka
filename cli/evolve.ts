import {Pool, spawn, Worker} from 'threads'
import {play} from '../src/game'
import {Competitor, Generation} from '../src/models'
import {copyNetwork, createRandomNetwork, createZeroNetwork, Network} from '../src/network'
import {createStartGameState} from '../src/state'
import {choose, makeid, N} from '../src/utils'
import {arena} from './arena'
import {load, save} from './utils/helpers'

const DEPTH = 4 // minimax search depth

const pool = Pool(() => spawn<arena>(new Worker('arena.js')))

void async function main() {
  if (process.argv.length < 3) {
    console.log(`
  Usage:

    node evolve.js PATH [GEN]
`)
    process.exit(1)
  }
  const storagePath = process.argv[2]
  const fs = require('fs')
  if (!fs.existsSync(storagePath)) {
    fs.mkdirSync(storagePath)
  }

  let gen: Generation
  if (process.argv.length == 4) {
    let startGen = process.argv[3]
    gen = load(startGen)
    console.log(`Starting from gen "${startGen}" (gen: ${gen.number})`)
  } else {
    console.log('Generating random population')
    gen = createRandomGeneration(30)
  }

  while (true) {
    gen.number++
    const perMen = 5

    let totalGames = gen.population.length * perMen
    let gameFinished = 0
    let bestMen = gen.population[0]

    for (let men of gen.population) {
      men.score = 0
    }

    let tasks = []
    for (let i = 0; i < gen.population.length; i++) {
      let men = gen.population[i]
      for (let opponent of choose(i, gen.population, perMen)) {
        tasks.push(pool.queue(async arena => {
          let result = await arena.play(createStartGameState(), 'white', men.net, opponent.net, DEPTH)

          if (result == 'white won') {
            men.score += 1
            men.won++
            opponent.score -= 2
            opponent.lose++
          } else if (result == 'black won') {
            men.score -= 2
            men.lose++
            opponent.score += 1
            opponent.won++
          } else if (result == 'draw') {
            men.draw++
            opponent.draw++
          }

          gameFinished++
          console.log(`Generation ${gen.number} progress: ${Math.floor(100 * gameFinished / totalGames)}%  ${info(men)} vs ${info(opponent)}: ${result}`)
        }))
      }
    }

    await Promise.all(tasks)

    gen.population.sort(byScore)
    save(`${storagePath}/${gen.number}.json`, gen)
    console.log(`\nResults for generation ${gen.number}`)
    for (let i = 0; i < gen.population.length; i++) {
      let men = gen.population[i]
      console.log(`${info(men)}: ${men.score}`)
    }

    gen.population.splice(15)
    let nextGen = gen.population.map(mutate)
    gen.population.push(...nextGen)
  }
}()

const T = 1 / Math.sqrt(2 * Math.sqrt(1741))

function mutate(men: Competitor): Competitor {
  let sigma = men.sigma.slice()
  for (let i = 0; i < sigma.length; i++) {
    sigma[i] = sigma[i] * Math.exp(T * N())
  }

  let net = copyNetwork(men.net)
  net.name = men.net.name.slice(men.net.name.length - 3) + '/' + makeid(3)
  net.generation = men.net.generation + 1

  for (let i = 0; i < net.weights.length; i++) {
    net.weights[i] += sigma[i] * N()
  }
  for (let j = 0; j < net.biases.length; j++) {
    net.biases[j] += sigma[net.weights.length + j] * N()
  }
  net.K += sigma[net.weights.length + net.biases.length] * N()
  if (net.K < 1) net.K = 1
  if (net.K > 3) net.K = 3


  return {
    score: 0,
    won: 0,
    lose: 0,
    draw: 0,
    net,
    sigma,
  }
}

function createRandomGeneration(size: number): Generation {
  let generation: Generation = {
    number: 0,
    population: []
  }
  for (let i = 0; i < size; i++) {
    let net = createRandomNetwork(32, [40, 10, 1])
    generation.population.push({
      net,
      score: 0,
      won: 0,
      lose: 0,
      draw: 0,
      sigma: Array(net.weights.length + net.biases.length + 1).fill(0.05)
    })
  }
  return generation
}

function byScore(a: Competitor, b: Competitor): number {
  if (a.score < b.score) {
    return 1
  }
  if (a.score > b.score) {
    return -1
  }
  return 0
}

function info(men: Competitor): string {
  return `${men.net.name} (${men.net.generation},${men.won},${men.lose},${men.draw})`
}
