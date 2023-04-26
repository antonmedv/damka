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
  minimax(state: Board, depth: number): [number, number] {
    return global.minimax(state, depth)
  },
  allMoves(state: Board): string[] {
    return global.allMoves(state)
  }
}

export type worker = typeof worker
expose(worker)
