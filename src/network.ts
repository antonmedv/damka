import {makeid, randomFloat} from './utils'

export type Network = {
  name: string
  generation: number
  inputs: number
  layers: number[]
  weights: number[]
  biases: number[]
  K: number
}

export function createZeroNetwork(inputs: number, layers: number[]): Network {
  let net = createRandomNetwork(inputs, layers)
  net.weights = net.weights.fill(0)
  net.biases = net.biases.fill(0)
  net.K = 3
  return net
}

export function createRandomNetwork(inputs: number, layers: number[]): Network {
  let weightsSize = 0
  let prevSize = inputs
  for (let size of layers) {
    weightsSize += prevSize * size
    prevSize = size
  }
  let weights = Array(weightsSize)
  for (let i = 0; i < weightsSize; i++) {
    weights[i] = randomFloat(-0.2, 0.2)
  }

  let biasesSize = 0
  for (let size of layers) {
    biasesSize += size
  }
  let biases = Array(biasesSize)
  for (let i = 0; i < biasesSize; i++) {
    biases[i] = randomFloat(-0.2, 0.2)
  }

  return {
    name: makeid(3),
    generation: 0,
    inputs,
    layers,
    weights,
    biases,
    K: 2,
  }
}

export function calc(network: Network, input: number[]): number[] {
  let sum = 0
  for (let value of input) {
    sum += value
  }

  let prev = input
  if (input.length !== network.inputs) {
    throw new Error(`Network expects ${network.inputs} inputs, but got ${input.length}.`)
  }

  let w = 0, b = 0
  for (let l = 0; l < network.layers.length; l++) {
    let layer = Array(network.layers[l]).fill(0)
    for (let n = 0; n < layer.length; n++) {
      let a = 0
      for (let i = 0; i < prev.length; i++) {
        a += network.weights[w++] * prev[i]
      }
      a += network.biases[b++]

      // Inject sum of input values to last layer
      if (l == network.layers.length - 1) {
        a += sum
      }

      layer[n] = Math.tanh(a)
    }
    prev = layer
  }
  return prev
}

export function copyNetwork(net: Network): Network {
  return {
    name: net.name,
    generation: net.generation,
    inputs: net.inputs,
    layers: net.layers.slice(),
    weights: net.weights.slice(),
    biases: net.biases.slice(),
    K: net.K,
  }
}
