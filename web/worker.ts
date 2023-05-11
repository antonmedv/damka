import { expose } from 'threads/worker'

import '../build/wasm_exec.js'
import { Board } from './board'

const global = globalThis as any
const go = new global.Go()
WebAssembly
  .instantiateStreaming(fetch(new URL('../build/main.wasm', import.meta.url).href), go.importObject)
  .then(result => go.run(result.instance))


const worker = {
  buildTime(): string | undefined {
    return global.buildTime
  },
  popName(index: number): [number, number] {
    return global.popName(index)
  },
  minimax(state: Board, depth: number, index: number): [number, number] {
    return global.minimax(state, depth, index)
  },
  allMoves(state: Board): string[] {
    return global.allMoves(state)
  }
}

export type worker = typeof worker
expose(worker)
